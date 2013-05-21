#!/usr/bin/env python

from __future__ import division
import json
import pprint
import calendar

import psycopg2

from utils import *
import config
import jsonschema


#--------------------------------------------------------------------------------
# EXCEPTIONS

class BackendError(Exception): pass   # generic error.  TODO: refine this

#--------------------------------------------------------------------------------
# CONFIG

# which domains do we care about?
# only these will be returned via the API
ANNOTATION_DOMAINS = """

    text:char
    text:word
    text:line
    text:lineorder

""".strip().split()

#--------------------------------------------------------------------------------
# DB HELPERS

def getDbConnection(database_name):
    dbConnectionString = "host='ea' dbname='%s' user='%s' password='%s'"
    return psycopg2.connect(dbConnectionString % (database_name, config.DB_USER, config.DB_PASSWORD))

def getColumnNames(conn, table):
    """Return a list of column names for the given table.
    """
    sql = "SELECT * FROM %s LIMIT 1;" % table
    cursor = conn.cursor()
    cursor.execute(sql)
    return [column[0] for column in cursor.description]

def dbQueryDict(conn, sql, values=()):
    """Run the sql and yield the results as dictionaries
    This is useful for SELECTs
    """
    debugSQL(sql)
    debugSQL('... %s' % str(values))
    cursor = conn.cursor()
    cursor.arraysize = 2000
    cursor.execute(sql, values)
    def iterator():
        columnNames = None
        while True:
            rows = cursor.fetchmany(size=2000)
            if not rows:
                break
            if not columnNames:
                columnNames = [column[0] for column in cursor.description]
            for row in rows:
                d = dict(zip(columnNames, row))
                yield d
    return iterator()

def dbExecute(conn, sql):
    """Run the sql and return the number of rows affected.
    This is useful for delete or insert commands
    """
    cursor = conn.cursor()
#     cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cursor.execute(sql)
    return cursor.rowcount

def dbTimestampToUTCTime(databaseTime):
    """Convert a time from the database to a unix seconds-since-epoch time
    """
    return calendar.timegm(databaseTime.utctimetuple())

#--------------------------------------------------------------------------------
# MAIN

def _imageDictDbToApi(conn, d):
    """Given an image row from the database, convert it to an API-style object.
    Convert db timestamps to unix time.
    Fetch and add tags.
    Add image URLs.
    """
    d2 = dict(d)

    # add tags
    debugDetail('getting tags for image %s' % d['id'])
    sql = """SELECT * FROM tag WHERE image_id = %s;"""
    values = (d['id'],)
    tags = []
    for row in dbQueryDict(conn, sql, values):
        tags.append(row['name'])
    d2['tags'] = tags

    # convert timestamp from datetime to unix time
    d2['stamp'] = dbTimestampToUTCTime(d['stamp'])

    # add image urls
    d2['thumb_url'] = '/thumb/%s.%s' % (d2['locator'], d2['format'])
    d2['url'] = '/image/%s.%s' % (d2['locator'], d2['format'])
    return d2

def _annotationDictDbToApi(d):
    """Given an annotation row from the database, convert it to an API-style object.
    Convert db timestamps to unix time.
    Parse boundary values from strings into JSON-style nested lists: [[1,2],[3,4] ... ]
    """
    d2 = dict(d)

    # convert timestamp from datetime to unix time
    d2['stamp'] = dbTimestampToUTCTime(d['stamp'])

    # parse boundary values which are strings like "((1,2),(3,4),(5,6),(7,8))"
    # convert them to json lists: [[1,2],[3,4] ... ]
    if d2['domain'] in ANNOTATION_DOMAINS:
        d2['boundary'] = json.loads(d2['boundary'].replace('(','[').replace(')',']'))

    return d2


def getDatabaseNames():
    sql = """ SELECT datname FROM pg_database ORDER BY datname """
    conn = getDbConnection(config.INITIAL_DB_NAME) # hardcode the one we know exists
    rows = list(dbQueryDict(conn, sql))
    return [row['datname'] for row in rows if row['datname'] not in config.DB_BLACKLIST]


def getTags(database_name):
    sql = """ SELECT DISTINCT name FROM tag ORDER BY name """
    conn = getDbConnection(database_name)
    rows = list(dbQueryDict(conn, sql))
    rows = [row['name'] for row in rows]
    return rows


def searchImages(queryDict):
    """
        Returns (full_count, [images]).
        Example queryDict:
        {
            database_name: 'rigor',
            has_tags: ['hello', 'there'],
            exclude_tags: ['iphone'],
            confidence_range: [1,4],    # TODO
            annotations: {              # TODO
                'character': {'geo': true},
                'word': {'text': false},
            }
            max_count: 50,  // max 50
            page: 3         // starts at 0
        }
    """
    # TODO: allow searching for NULL

    schema = dict(
        database_name = str,
        has_tags = [str],
        exclude_tags = [str],
        max_count = int,
        page = int
    )
    jsonschema.validate(schema, queryDict, allowExtraKeys=False, allowMissingKeys=True)

    sql = """SELECT *, COUNT(*) OVER() as full_count FROM image"""
    clauses = []
    values = []

    for tag in queryDict.get('has_tags', []):
        clauses.append(
            'EXISTS ('
            '\n    SELECT tag.image_id, tag.name FROM tag'
            '\n    WHERE tag.image_id = id'
            '\n    AND tag.name = %s'
            '\n)'
        )
        values.append(tag)

    for tag in queryDict.get('exclude_tags', []):
        clauses.append(
            'NOT EXISTS ('
            '\n    SELECT tag.image_id, tag.name FROM tag'
            '\n    WHERE tag.image_id = id'
            '\n    AND tag.name = %s'
            '\n)'
        )
        values.append(tag)

    if clauses:
        sql = sql + '\nWHERE ' + '\nAND '.join(clauses)

    sql += '\nORDER BY stamp DESC'

    max_count = min(int(queryDict.get('max_count', 50)), 50)
    sql += '\nLIMIT %s'
    values.append(max_count)

    if 'page' in queryDict:
        page = int(queryDict['page'])
        sql += '\nOFFSET %s'
        values.append(page * max_count)

    conn = getDbConnection(queryDict['database_name'])
    results = list(dbQueryDict(conn, sql, values))

    # remove full_count
    if results:
        full_count = int(results[0]['full_count']) # do int() to convert it from a long int
        for r in results:
            del r['full_count']
    else:
        full_count = 0

    # add database_name
    for r in results:
        r['database_name'] = queryDict['database_name']

    # add ii
    for ii, r in enumerate(results):
        r['ii'] = ii + queryDict['page'] * queryDict['max_count']

    # fill in tags, add image urls
    results = [_imageDictDbToApi(conn, r) for r in results]

    return (full_count, results)


def getImage(database_name, id=None, locator=None):
    if id and locator:
        raise BackendError
    elif not id and not locator:
        raise BackendError
    elif id:
        sql = """
            SELECT * FROM image WHERE id = %s;
        """
        values = ( id, )
    elif locator:
        sql = """
            SELECT * FROM image WHERE locator = %s;
        """
        values = ( locator, )

    conn = getDbConnection(database_name)
    rows = list(dbQueryDict(conn, sql, values))
    if len(rows) == 0:
        raise BackendError
    elif len(rows) == 1:
        return _imageDictDbToApi(conn, rows[0])
    else:
        raise BackendError


def getImageAnnotations(database_name, locator):
    # first look up image id
    sql = """
        SELECT * FROM image WHERE locator = %s;
    """
    values = ( locator, )

    conn = getDbConnection(database_name)
    rows = list(dbQueryDict(conn, sql, values))
    if len(rows) == 0:
        raise BackendError
    elif len(rows) == 1:
        id = rows[0]['id']
    else:
        raise BackendError
    print id


    # then look up annotations
    sql = """
        SELECT * FROM annotation
        WHERE image_id = %s
        ORDER BY id;
    """
    # TODO: add textcluster, blur, money domains
    values = ( id, )

    rows = list(dbQueryDict(conn, sql, values))
    # only keep the domains we care about
    rows = [r for r in rows if r['domain'] in ANNOTATION_DOMAINS]
    # remove rows with null boundaries
    rows = [r for r in rows if r['boundary'] is not None]

    rows = [_annotationDictDbToApi(r) for r in rows]

    # sort by y coordinate
    def sortKey(r):
        if isinstance(r['boundary'],list):
            return ('a', r['boundary'][0][1])
        return ('b', r['stamp'])
    rows.sort(key = sortKey)

    return rows

#--------------------------------------------------------------------------------
# MAIN

# connect upon importing this module
# this is messy and should be cleaned up later

if __name__ == '__main__':
#     print getImage(id=23731)
#     print getImage(database_name='rigor',locator='01bb6939-ac7f-4dbf-84c9-8136eaa3f6ea');

#     print yellow(pprint.pformat(getImage(database_name='rigor',locator='afa567f9-f55b-4283-a1ea-d5682637ed4e')))
#     print cyan(pprint.pformat(getImageAnnotations(database_name='rigor',locator='afa567f9-f55b-4283-a1ea-d5682637ed4e')))

#     print yellow(pprint.pformat(getImage(database_name='rigor', locator='0571f3fe-cb88-4818-b213-36f08b48f132')))
#     print cyan(pprint.pformat(getImageAnnotations(database_name='rigor', locator='0571f3fe-cb88-4818-b213-36f08b48f132')))

    print getTags('blindsight')

#     debugMain('testing searchImages')
#     full_count, images = searchImages({
#         'database_name': 'rigor',
#         'has_tags': ['money'],
#         'exclude_tags': ['testdata'],
#         'max_count': 2,
#         'page': 0,
#     })
#     debugDetail('full count = %s' % repr(full_count))
#     for image in images:
#         debugDetail(pprint.pformat(image))

#     debugMain('databases:')
#     for db in getDatabaseNames():
#         debugDetail(db)
# 




#
