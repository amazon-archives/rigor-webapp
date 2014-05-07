#!/usr/bin/env python

from __future__ import division
import json
import pprint
import calendar
import os
import tempfile
import subprocess
import uuid

from utils import *
import config
import jsonschema

# use rigor's database layer instead of hitting the db directly?
if config.USE_RIGOR_DB_LAYER:
    import rigor.database
else:
    import psycopg2

# Things to fix when porting to rigor's database layer using pg8000:
#   - sql values must be more strict:
#       - uuids have to be python uuid.UUID objects instead of strings
#       - if the database column is an int, must provide a python int and not a string
#   - dbExecute used to be able to run multiple sql commands at once, separated by ';'.
#      this is no longer allowed; must issue separate dbExecute calls for each sql command.
#   - dbExecute now runs commit() automatically.
#
# The browse-related portion of this file has been ported.
# Crowd-related functions have not been touched yet.
#
# Only tested with rigor running on pg8000, not rigor running psycopg2.

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
    if config.USE_RIGOR_DB_LAYER:
        db = rigor.database.Database.instance(database_name)
        return db
    else:
        dbConnectionString = "host='%s' dbname='%s' user='%s' password='%s'"
        return psycopg2.connect(dbConnectionString % (config.DB_HOST, database_name, config.DB_USER, config.DB_PASSWORD))

def dbQueryDict(conn, sql, values=()):
    """Run the sql and yield the results as dictionaries
    This is useful for SELECTs
    """
    debugSQL(sql)
    debugSQL('... %s' % str(values))
    if config.USE_RIGOR_DB_LAYER:
        with conn.get_cursor() as cursor:
            cursor.execute(sql, values)
            for row in cursor.fetch_all():
                rowdict = dict(row.iteritems())
                # convert UUID instances to strings
                for k,v in rowdict.items():
                    if isinstance(v, uuid.UUID):
                        rowdict[k] = str(v)
                yield rowdict
    else:
        cursor = conn.cursor()
        cursor.arraysize = 2000
        cursor.execute(sql, values)

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

def dbExecute(conn, sql, values=()):
    """Run the sql and return the number of rows affected.
    This is useful for delete or insert commands
    You should call conn.commit() after this.
    """
    debugSQL(sql)
    debugSQL('... %s' % str(values))
    if config.USE_RIGOR_DB_LAYER:
        with conn.get_cursor() as cursor:
            cursor.execute(sql, values)
            return cursor.rowcount
    else:
        cursor = conn.cursor()
        cursor.execute(sql, values)
        conn.commit()
        return cursor.rowcount

def dbInsertAndGetId(conn, sql, values=()):
    """Run the sql (which is assumed to be an "INSERT ... RETURNING id;") and return the id of the new row.
    You should call conn.commit() after this.
    """
    if config.USE_RIGOR_DB_LAYER:
        # TODO
        raise "this function has not been ported yet to use the rigor db layer."
    else:
        debugSQL(sql)
        debugSQL('... %s' % str(values))
        cursor = conn.cursor()
        cursor.execute(sql, values)
        return cursor.fetchone()[0]

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
    values = (int(d['id']),)
    tags = []
    for row in dbQueryDict(conn, sql, values):
        tags.append(row['name'])
    d2['tags'] = sorted(list(set(tags)))

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

    sql += '\nORDER BY image.id ASC'

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
        r['ii'] = ii + queryDict['page'] * max_count

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
        values = (int(id), )
    elif locator:
        sql = """
            SELECT * FROM image WHERE locator = %s;
        """
        if config.USE_RIGOR_DB_LAYER:
            # TODO: this should really depend on whether rigor is using
            #  pg8000 or psycopg2
            values = (uuid.UUID(locator), )
        else:
            values = (locator, )

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
    values = (int(id), )

    conn = getDbConnection(database_name)
    rows = list(dbQueryDict(conn, sql, values))
    if len(rows) == 0:
        raise BackendError
    elif len(rows) == 1:
        id = rows[0]['id']
    else:
        raise BackendError

    # then look up annotations
    sql = """
        SELECT * FROM annotation
        WHERE image_id = %s
        ORDER BY id;
    """
    # TODO: add textcluster, blur, money domains
    values = (int(id), )

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
    values = (int(id),)
    tags = []
    for row in dbQueryDict(conn, sql, values):
        tags.append(row['name'])
    return tags

def saveAnnotations(database_name, annotations):
    """Given a list of annotations as json objects / dicts,
    apply the changes listed in their '_edit_state' fields.
    Note that the '_edit_state' field must be added on on the javascript side.
    Possible values:
       edited -- apply the new values of 'model' and 'confidence'
       new -- add the annotation 
       deleted -- remove the annotation
    """
    conn = getDbConnection(database_name)
    debugDetail('saving %s annotations to %s' % (len(annotations), database_name))
    sql_lines = []
    sql_values = []
    for annotation in annotations:
        debugDetail('    annotation %s: %s'%(annotation['id'], annotation['_edit_state']))
        if annotation['_edit_state'] == 'edited':
            sql_lines.append(""" UPDATE annotation SET model = %s WHERE id = %s; """)
            sql_values.append((annotation['model'], int(annotation['id'])))
            sql_lines.append(""" UPDATE annotation SET confidence = %s WHERE id = %s; """)
            sql_values.append((annotation['confidence'], int(annotation['id'])))
        elif annotation['_edit_state'] == 'deleted':
            sql_lines.append(""" DELETE FROM annotation_tag WHERE annotation_id = %s; """)
            sql_values.append((int(annotation['id'], )))
            sql_lines.append(""" DELETE FROM annotation WHERE id = %s; """)
            sql_values.append((int(annotation['id'], )))
        elif annotation['_edit_state'] == 'new':
            debugDetail('NOT IMPLEMENTED YET: add new annotation')
        # TODO: check for _edit_state = 'deleted' and 'new'
    if sql_lines:
        for l,v in zip(sql_lines, sql_values):
            dbExecute(conn, l, values=v)

#--------------------------------------------------------------------------------
# CROWD

def getCrowdStats(database_name):
    """Return a dict with info about the number of tasks done and still needing to be done.
    {
        words_raw: 29,
        words_approved: 29, // approved but not yet sliced
        words_sliced: 29,
        words_total: 104,
        words_rejected: 104,
        words_progress: 0.34  // fraction of the entire task that is complete, range 0-1
    }
    """
    conn = getDbConnection(database_name)
    debugDetail('getting stats for %s' % database_name)

    result = {}

    sql = """ SELECT count(1) FROM annotation WHERE domain = 'text:word' AND confidence = %s; """
    result['words_raw'] = int(list(dbQueryDict(conn, sql, [config.CROWD_WORD_CONF_RAW]))[0]['count'])
    result['words_approved'] = int(list(dbQueryDict(conn, sql, [config.CROWD_WORD_CONF_APPROVED]))[0]['count'])
    result['words_sliced'] = int(list(dbQueryDict(conn, sql, [config.CROWD_WORD_CONF_SLICED]))[0]['count'])
    result['words_rejected'] = int(list(dbQueryDict(conn, sql, [config.CROWD_WORD_CONF_REJECTED]))[0]['count'])
    result['words_total'] = result['words_raw'] + result['words_approved'] + result['words_sliced']
    result['words_progress'] = (result['words_raw'] * 0 + result['words_approved'] * 0.5 + result['words_sliced'] * 1) / result['words_total']
    return result

#-----------------------
# CROWD IMAGE

def getNextCrowdImage(database_name):
    """Return the id of a random image which has a word with CROWD_WORD_CONF_RAW
    If there are none, return None
    """
    conn = getDbConnection(database_name)
    debugDetail('getting next image')
    # get a word which needs processing (based on its confidence)
    # from the least recently seen image
    # and return the image it belongs to
    sql = """
        SELECT annotation.*, image.stamp as image_stamp
        FROM annotation, image
        WHERE domain = 'text:word'
        AND confidence = %s
        AND annotation.image_id = image.id
        ORDER BY image.stamp
        LIMIT 1
    """
    results = list(dbQueryDict(conn, sql, [config.CROWD_WORD_CONF_RAW]))
    if not results:
        return None
    print pprint.pformat(results[0])
    nextId = results[0]['image_id']

    # bump image stamp
    sql = """
        UPDATE image
        SET stamp = NOW()
        WHERE id = %s
    """
    dbExecute(conn, sql, [nextId])
    conn.commit()

    return nextId

def setConfidenceForAllWordsInImage(database_name, image_id, conf):
    conn = getDbConnection(database_name)
    debugDetail('bumping image confidence')
    sql = """
        UPDATE annotation
        SET confidence = %s
        WHERE image_id = %s;
    """
    values = [conf, int(image_id)]
    dbExecute(conn, sql, values)
    conn.commit()

def updateWordBoundaries(database_name, words):
    # input: a list of word dicts
    # each with an annotation_id and a boundary
    conn = getDbConnection(database_name)
    debugDetail('updating word boundaries')
    for word in words:
        sql = """
            UPDATE annotation
            SET boundary = %s, confidence = %s
            WHERE id = %s;
        """
        boundary = repr(word['boundary']).replace('[','(').replace(']',')')
        values = [boundary, config.CROWD_WORD_CONF_APPROVED, int(word['annotation_id'])]
        dbExecute(conn, sql, values)
    conn.commit()

#-----------------------
# CROWD WORD

def getNextCrowdWord(database_name):
    """Return the id of a random word which has confidence CROWD_WORD_CONF_APPROVED
    If there are none, return None
    """
    conn = getDbConnection(database_name)
    debugDetail('getting next word')
    sql = """
        SELECT id FROM annotation
        WHERE domain = 'text:word'
        AND confidence = %s
        ORDER BY stamp
        LIMIT 1
    """
    results = list(dbQueryDict(conn, sql, [config.CROWD_WORD_CONF_APPROVED]))
    if not results:
        return None
    nextId = results[0]['id']

    # bump word stamp
    sql = """
        UPDATE annotation
        SET stamp = NOW()
        WHERE id = %s
    """
    dbExecute(conn, sql, [nextId])
    conn.commit()

    return nextId


def _getCharsInWord(database_name, annotation_id):
    """Return a list of row dicts for each char annotation that has a center inside the given boundary (from a word annotation)
    The row dicts will have processing already done on them (unicode conversion, boundary string parsing)
    """
    conn = getDbConnection(database_name)
    debugDetail('getting chars in word %s' % (annotation_id))

    # new way
    sql = """
        SELECT * FROM annotation
        WHERE domain='text:char'
        AND id IN (
            SELECT annotation_id FROM annotation_tag
            WHERE name = %s
        );
    """
    values = [config.CROWD_PARENT_ANNOTATION_TAG_PREFIX + str(annotation_id)]

    charRows = list(dbQueryDict(conn, sql, values))
    goodChars = []
    for charRow in charRows:
        # process
        charRow['boundary'] = json.loads(charRow['boundary'].replace('(','[').replace(')',']'))
        charRow['model'] = charRow['model'].decode('utf8') # convert python string to unicode
        center_x = sum([x for (x,y) in charRow['boundary']]) / 4
        center_y = sum([y for (x,y) in charRow['boundary']]) / 4
        X,Y = 0,1
        goodChars.append(charRow)
    debugDetail('  %s chars found in boundary region' % len(goodChars))
    return goodChars

def getCrowdWord(database_name, annotation_id):
    """
    Finds the image that goes with the given annotation
    Crops out and undistorts the word from the image
    Saves the processed image to a temp location.
    Use getCrowdWordImagePath() to get just the path to the image later given the annotation_id.
    Returns JSON:
    {
        annotation_id
        model
        image_id
        image_path  # in local filesystem, not a URL
        x_res
        y_res
        ext         # file extension
        chars = [
            {
                start
                end
                model
            },
            { ... }
        ]
    }
    """
    conn = getDbConnection(database_name)
    debugDetail('getting word %s' % annotation_id)

    # get word details
    sql = """ SELECT * FROM annotation WHERE domain = 'text:word' AND id = %s; """
    wordRow = list(dbQueryDict(conn, sql, [annotation_id]))[0]

    # process word details
    boundary = eval(wordRow['boundary'])
    print boundary
    image_id = wordRow['image_id']
    model = wordRow['model'].decode('utf8') # convert python string to unicode

    # get image details
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
        debugError('image file does not exist for image %s' % image_id)
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
    # TODO: put this in the config
    outPath = config.CROWD_LOCAL_CROP_IMG_PATH % (database_name, annotation_id, destExt)
    # http://www.imagemagick.org/Usage/distorts/#perspective
    cmd = ["convert", path, '-matte', '-virtual-pixel', 'black',
           '-extent', '%sx%s' % (int(max(imageRow['x_resolution'],xRes)),int(max(imageRow['y_resolution'],yRes))),
           '-distort', 'BilinearReverse',
           coordString,
           '-crop', '%sx%s+0+0' % (xRes,yRes),
           outPath]
    debugCmd('>' + '  _  '.join(cmd))
    subprocess.call(cmd)

    # add chars
    chars = []
    # try loading char annotations from the db
    #   find chars with center points inside the word annotation
    existingChars = _getCharsInWord(database_name, annotation_id)
    X,Y = 0,1
    if existingChars:
        for char in existingChars:
            # calculate start and end fractions
            # TODO: this assumes axis-aligned word bounding boxes
            # replace this with better math to check if center is inside the boundary polygon
            start = (char['boundary'][0][X] - boundary[0][X]) / (boundary[1][X] - boundary[0][X])
            end = (char['boundary'][1][X] - boundary[0][X]) / (boundary[1][X] - boundary[0][X])
            start = min(1, max(0, start))
            end = min(1, max(0, end))
            chars.append({
                "start": start,
                "end": end,
                "model": char['model'],
            })
        # sort from left to right by center point
        chars.sort(key = lambda ch: ch['start'])
        # TODO: add missing chars, remove extra chars to match word model (??)
        if len(chars) != len(model):
            debugError('Warning: model is %s chars long but %s char annotations were found' % (len(model), len(chars)))
    else:
        # no existing chars.  generate new ones
        for ii,char in enumerate(model):
            chars.append({
                "start": (ii+0.05) / len(model),
                "end": (ii+0.95) / len(model),
                "model": char
            })
        # expand first and last chars to hit edges of image
        if chars:
            chars[0]['start'] = 0
            chars[-1]['end'] = 1

    # build JSON
    result = dict(
        annotation_id = annotation_id,
        model = model,
        image_id = image_id,
        image_path = outPath,
        x_res = xRes,
        y_res = yRes,
        ext = destExt,
        chars = chars,
        confidence = wordRow['confidence'],
    )
    return result

def getCrowdWordImagePath(database_name, annotation_id, ext):
    """Return the path in the local filesystem to the cropped image for the given word annotation.
    """
    annotation_id = annotation_id.replace('/','').replace('.','').replace('\0','')
    database_name = database_name.replace('/','').replace('.','').replace('\0','')
    ext = ext.replace('/','').replace('.','').replace('\0','')
    return config.CROWD_LOCAL_CROP_IMG_PATH % (database_name, annotation_id, ext)

def saveCrowdWord(database_name, word_data):
    debugDetail('saving word')
    debugCmd(pprint.pformat(word_data))

    conn = getDbConnection(database_name)

    # get word boundary
    sql = """ SELECT * FROM annotation WHERE domain = 'text:word' AND id = %s; """
    wordRow = list(dbQueryDict(conn, sql, [word_data['annotation_id']]))[0]
    wordBoundary = eval(wordRow['boundary'])

    # bump word confidence
    sql = """ UPDATE annotation SET confidence = %s WHERE id = %s; """
    values = [config.CROWD_WORD_CONF_SLICED, int(word_data['annotation_id'])]
    dbExecute(conn, sql, values)

    # update word model
    sql = """ UPDATE annotation SET model = %s WHERE id = %s; """
    values = [word_data['model'], int(word_data['annotation_id'])]
    dbExecute(conn, sql, values)

    # delete existing char annotations for this word inside the boundary
    existingChars = _getCharsInWord(database_name, word_data['annotation_id'])
    for char in existingChars:
        # remove annotation tag
        sql = """
            DELETE FROM annotation_tag
            WHERE annotation_id=%s
            AND name LIKE %s;
        """
        values = [char['id'], config.CROWD_PARENT_ANNOTATION_TAG_PREFIX + word_data['annotation_id']]
        dbExecute(conn, sql, values)
        # remove annotation itself
        sql = """
            DELETE FROM annotation
            WHERE domain='text:char'
            AND id = %s;
        """
        values = [int(char['id'])]
        dbExecute(conn, sql, values)

    def _pointInterp(a, b, pct):
        ax, ay = a
        bx, by = b
        return (ax*(1-pct) + bx*pct,
                ay*(1-pct) + by*pct)

    def _makePolygonString(boundary):
        result = []
        for x,y in boundary:
            assert type(x) in (int,float)
            assert type(y) in (int,float)
            result.append((int(x+0.5),int(y+0.5)))
        return str(tuple(tuple(point) for point in result))

    # add new annotations
    for char in word_data['chars']:
        debugDetail('CHAR: %s' % char['model'].encode('utf8'))
        # first, add char annotation
        charBoundary = []
        charBoundary.append(_pointInterp(wordBoundary[0], wordBoundary[1], char['start']))
        charBoundary.append(_pointInterp(wordBoundary[0], wordBoundary[1], char['end']))
        charBoundary.append(_pointInterp(wordBoundary[3], wordBoundary[2], char['end']))
        charBoundary.append(_pointInterp(wordBoundary[3], wordBoundary[2], char['start']))
        sql = """
            INSERT INTO annotation(image_id, stamp, boundary, domain, model, confidence)
            VALUES (%s, NOW(), %s, %s, %s, %s)
            RETURNING id;
        """
        values = [int(word_data['image_id']), _makePolygonString(charBoundary), 'text:char', char['model'], config.CROWD_CHAR_CONF_SLICED]
        newCharId = dbInsertAndGetId(conn, sql, values)
        debugDetail('new id = %s' % newCharId)
        sql = """
            INSERT INTO annotation_tag(annotation_id, name)
            VALUES (%s,%s);
        """
        values = [int(newCharId), config.CROWD_PARENT_ANNOTATION_TAG_PREFIX + str(word_data['annotation_id'])]
        dbExecute(conn, sql, values)

    debugDetail('committing')
    conn.commit()

#
