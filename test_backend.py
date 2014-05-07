#!/usr/bin/env python

import types
import pprint

import backend
import config
from utils import *

DBNAME = config.CROWD_DB


debugMain('dbQueryDict')
sql = 'SELECT COUNT(*) FROM image;'
conn = backend.getDbConnection(DBNAME)
gen = backend.dbQueryDict(conn, sql)
assert isinstance(gen, types.GeneratorType)
rows = list(gen)
assert len(rows) == 1
assert isinstance(rows[0], dict)
assert 'count' in rows[0]


debugMain('getDatabaseNames')
names = backend.getDatabaseNames()
assert DBNAME in names
debugDetail(names)


debugMain('getTags')
tags = backend.getTags(DBNAME)
assert len(tags) > 0
assert isinstance(tags[0], basestring)
assert sorted(tags)[0] == 'align=center'


debugMain('getImage by id')
ID = 1
imgDict = backend.getImage(DBNAME, id=ID)
assert isinstance(imgDict, dict)
assert 'id' in imgDict
assert imgDict['id'] == ID
assert 'tags' in imgDict
assert len(imgDict['tags']) > 0
assert isinstance(imgDict['tags'][0], basestring)


debugMain('searchImages')
queryDict = dict(
    database_name = DBNAME,
    has_tags = ['align=left'],
    page = 1,
    max_count = 4,
)
count, results = backend.searchImages(queryDict)
assert count > 1
assert isinstance(results, list)
assert isinstance(results[0], dict)
assert 'tags' in results[0]


debugMain('getImage by locator')
LOCATOR = '4075c8de-fb2e-41e8-831b-ea4bdcb5a6a3'
imgDict = backend.getImage(DBNAME, locator=LOCATOR)
assert isinstance(imgDict, dict)
assert 'locator' in imgDict
assert imgDict['locator'] == LOCATOR
assert 'tags' in imgDict
assert len(imgDict['tags']) > 0
assert isinstance(imgDict['tags'][0], basestring)


debugMain('getImageAnnotations')
ID = 1
annotations = backend.getImageAnnotations(DBNAME, ID)
assert isinstance(annotations, list)
assert isinstance(annotations[0], dict)
assert 'domain' in annotations[0]


print green('===== success =====')


