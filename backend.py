#!/usr/bin/env python

from __future__ import division
import json
import pprint
import calendar
import os
import tempfile
import subprocess

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

def dbExecute(conn, sql, values=()):
    """Run the sql and return the number of rows affected.
    This is useful for delete or insert commands
    You should call conn.commit() after this.
    """
    cursor = conn.cursor()
#     cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cursor.execute(sql, values)
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


def getImageAnnotations(database_name, id):
    # first look up image id
    sql = """
        SELECT * FROM image WHERE id = %s;
    """
    values = ( id, )

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


def getAnnotationTags(database_name, id):
    conn = getDbConnection(database_name)
    debugDetail('getting tags for annotation %s' % id)
    sql = """SELECT * FROM annotation_tag WHERE annotation_id = %s;"""
    values = (id,)
    tags = []
    for row in dbQueryDict(conn, sql, values):
        tags.append(row['name'])
    return tags

def saveAnnotations(database_name, annotations):
    # given a list of annotations as json objects / dicts,
    # apply the changes listed in their '_edit_state' fields.
    # note that the '_edit_state' field must be added on on the javascript side.
    # possible values:
    #   edited -- apply the new values of 'model' and 'confidence'
    #   new -- add the annotation 
    #   deleted -- remove the annotation
    conn = getDbConnection(database_name)
    debugDetail('saving %s annotations to %s' % (len(annotations), database_name))
    sql_lines = []
    sql_values = []
    for annotation in annotations:
        debugDetail('    annotation %s: %s'%(annotation['id'], annotation['_edit_state']))
        if annotation['_edit_state'] == 'edited':
            sql_lines.append(""" UPDATE annotation SET model = %s WHERE id = %s; """)
            sql_values.append(annotation['model'])
            sql_values.append(annotation['id'])
            sql_lines.append(""" UPDATE annotation SET confidence = %s WHERE id = %s; """)
            sql_values.append(annotation['confidence'])
            sql_values.append(annotation['id'])
        elif annotation['_edit_state'] == 'deleted':
            sql_lines.append(""" DELETE FROM annotation_tag WHERE annotation_id = %s; """)
            sql_values.append(annotation['id'])
            sql_lines.append(""" DELETE FROM annotation WHERE id = %s; """)
            sql_values.append(annotation['id'])
        elif annotation['_edit_state'] == 'new':
            debugDetail('NOT IMPLEMENTED YET: add new annotation')
        # TODO: check for _edit_state = 'deleted' and 'new'
    if sql_lines:
        sql_lines = '\n'.join(sql_lines)
        debugSQL(sql_lines)
        debugSQL(sql_values)
        dbExecute(conn, sql_lines, values=sql_values)
        conn.commit()

#--------------------------------------------------------------------------------
# CROWD

def getCrowdStats(database_name):
    """Return a dict with info about the number of tasks done and still needing to be done.
    {
        words_todo: 29,
        words_total: 104,
    }
    """
    conn = getDbConnection(database_name)
    debugDetail('getting stats for %s' % database_name)

    result = {}

    sql = """ SELECT count(1) FROM annotation WHERE confidence = %s; """
    result['words_todo'] = int(list(dbQueryDict(conn, sql, [config.CROWD_WORD_CONF_TODO]))[0]['count'])
    sql = """ SELECT count(1) FROM annotation; """
    result['words_total'] = int(list(dbQueryDict(conn, sql))[0]['count'])
    return result

def getNextCrowdWord(database_name):
    """Return the id of a random word which has confidence CROWD_WORD_CONF_TODO
    """
    conn = getDbConnection(database_name)
    debugDetail('getting next word')
    sql = """ SELECT id FROM annotation
    WHERE confidence = %s
    ORDER BY RANDOM()
    LIMIT 1
    """
    return list(dbQueryDict(conn, sql, [config.CROWD_WORD_CONF_TODO]))[0]['id']

def getCrowdWord(database_name, annotation_id):
    """
    Finds the image that goes with the given annotation
    Crops out and undistorts the word from the image
    Saves the processed image to a temp location
    Returns JSON:
    {
        annotation_id
        model
        image_id
        image_path # in local filesystem, not a URL
        x_res
        y_res
        ext
    }
    """
    conn = getDbConnection(database_name)
    debugDetail('getting word %s' % annotation_id)

    sql = """ SELECT * FROM annotation WHERE id = %s; """
    wordRow = list(dbQueryDict(conn, sql, [annotation_id]))[0]

    boundary = eval(wordRow['boundary'])
    image_id = wordRow['image_id']

    sql = """ SELECT * FROM image WHERE id = %s; """
    imageRow = list(dbQueryDict(conn, sql, [image_id]))[0]
    locator = imageRow['locator'].replace('-','').replace('/','').replace('..','').replace('\0','')
    sourceExt = imageRow['format']
    destExt = 'jpg'
    path = '/data/rigor/images/%s/%s/%s.%s' % (
                locator[:2],
                locator[2:4],
                locator,
                sourceExt
            )

    if not os.path.exists(path):
        debugError('image does not exist')
        return None

    # compute aspect ratio of annotation box
    # and resolution of undistorted image
    def dist(p1,p2):
        return ( (p1[0]-p2[0])**2 + (p1[1]-p2[1])**2 ) ** 0.5
    xDist = dist(boundary[0],boundary[1])
    yDist = dist(boundary[1],boundary[2])
    aspect = xDist / yDist
    aspect = min(max(aspect, 1/3), 5)
    xRes = config.CROWD_WORD_WIDTH
    yRes = xRes / aspect

    # if word is too tall, scale down
    if yRes > config.CROWD_MAX_WORD_HEIGHT:
        xRes = xRes * config.CROWD_MAX_WORD_HEIGHT / yRes
        yRes = config.CROWD_MAX_WORD_HEIGHT

    xRes = int(xRes)
    yRes = int(yRes)

    # make list of x,y tuples for ImageMagick's distort function
    coords = [
        boundary[0], (0,0),
        boundary[1], (xRes,0),
        boundary[2], (xRes,yRes),
        boundary[3], (0,yRes),
    ]
    coordString = ' '.join(['%s,%s'%(x,y) for x,y in coords])

    # undistort and resize word from the image
    outPath = 'temp/word-crop-%s-%s.%s' % (database_name, annotation_id, destExt)
#     outPath = tempfile.mkstemp(suffix="." + destExt)[1]
    # http://www.imagemagick.org/Usage/distorts/#perspective
    cmd = ["convert", path, '-matte', '-virtual-pixel', 'black',
           '-extent', '%sx%s' % (max(imageRow['x_resolution'],xRes),max(imageRow['y_resolution'],yRes)),
           '-distort', 'BilinearReverse',
           coordString,
           '-crop', '%sx%s+0+0' % (xRes,yRes),
           outPath]
    debugCmd('>' + '  _  '.join(cmd))
    subprocess.call(cmd)

    result = dict(
        annotation_id = annotation_id,
        model = wordRow['model'].decode('utf8'), # convert from python string to unicode
        image_id = wordRow['image_id'],
        image_path = outPath,
        x_res = xRes,
        y_res = yRes,
        ext = destExt,
    )
    return result

def getCrowdWordImagePath(database_name, annotation_id, ext):
    annotation_id = annotation_id.replace('/','').replace('.','').replace('\0','')
    database_name = database_name.replace('/','').replace('.','').replace('\0','')
    ext = ext.replace('/','').replace('.','').replace('\0','')
    return 'temp/word-crop-%s-%s.%s' % (database_name, annotation_id, ext)

#--------------------------------------------------------------------------------
# MAIN

# connect upon importing this module
# this is messy and should be cleaned up later

if __name__ == '__main__':


    print getCrowdWordImage('icdar2003', 1)

#     print getImage(id=23731)
#     print getImage(database_name='rigor',locator='01bb6939-ac7f-4dbf-84c9-8136eaa3f6ea');

#     print yellow(pprint.pformat(getImage(database_name='rigor',locator='afa567f9-f55b-4283-a1ea-d5682637ed4e')))
#     print cyan(pprint.pformat(getImageAnnotations(database_name='rigor',locator='afa567f9-f55b-4283-a1ea-d5682637ed4e')))

#     print yellow(pprint.pformat(getImage(database_name='rigor', locator='0571f3fe-cb88-4818-b213-36f08b48f132')))
#     print cyan(pprint.pformat(getImageAnnotations(database_name='rigor', locator='0571f3fe-cb88-4818-b213-36f08b48f132')))

#     print getTags('blindsight')

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
