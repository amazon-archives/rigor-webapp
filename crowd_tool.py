#!/usr/bin/env python

from __future__ import division
import json
import pprint
import calendar
import os
import sys
import tempfile
import subprocess

import psycopg2

from utils import *
import config


#--------------------------------------------------------------------------------
# DB HELPERS

def getDbConnection(database_name):
    dbConnectionString = "host='%s' dbname='%s' user='%s' password='%s'"
    return psycopg2.connect(dbConnectionString % (config.DB_HOST, database_name, config.DB_USER, config.DB_PASSWORD))

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
    debugSQL(sql)
    debugSQL('... %s' % str(values))
    cursor = conn.cursor()
    cursor.execute(sql, values)
    return cursor.rowcount

def dbInsertAndGetId(conn, sql, values=()):
    """Run the sql (which is assumed to be an "INSERT ... RETURNING id;") and return the id of the new row.
    You should call conn.commit() after this.
    """
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

def resetCrowdDb(dbname):
    debugDetail('resetting crowd database: %s' % dbname)

    debugDetail('  deleting character annotations')
    conn = getDbConnection(dbname)
    sql = """
        DELETE FROM annotation_tag
        WHERE name LIKE %s;
    """
    dbExecute(conn, sql, values=[config.CROWD_PARENT_ANNOTATION_TAG_PREFIX[:-1] + '%'])
    sql = """
        DELETE FROM annotation
        WHERE domain='text:char';
    """
    dbExecute(conn, sql)

    debugDetail('  setting word confidences to "raw" (%s)' % config.CROWD_WORD_CONF_RAW)
    sql = """
        UPDATE annotation
        SET confidence=%s
        WHERE domain='text:word';
    """
    values = [config.CROWD_WORD_CONF_RAW]
    dbExecute(conn, sql, values)

    debugDetail('  committing')
    conn.commit()

def fixQuotes(dbname):
    debugDetail('fixing quotes in %s' % dbname)
    conn = getDbConnection(dbname)
    sql = """
        SELECT id, model
        FROM annotation
        WHERE domain = 'text:word'
    """
    words = list(dbQueryDict(conn, sql, values=()))
    fixed = 0
    for word in words:
        model = word['model']
        if model.startswith(' "') and model.endswith('"'):
            fixed += 1
            print repr(word['model'])
            word['model'] = model[2:-1]
            print repr(word['model'])
            sql = """
                UPDATE annotation
                SET model=%s
                WHERE id=%s
            """
            values = (word['model'], word['id'])
            dbExecute(conn, sql, values)
    debugDetail('    %s words were fixed' % fixed)
    debugDetail('committing')
    conn.commit()

def markImageBad(dbname, image_id):
    debugDetail('resetting words in db %s, image %s to RAW confidence' % (dbname, image_id))
    conn = getDbConnection(dbname)
    sql = """
        UPDATE annotation
        SET confidence = %s
        WHERE domain = 'text:word'
        AND image_id = %s
    """
    values = [config.CROWD_WORD_CONF_RAW, image_id]
    dbExecute(conn, sql, values)
    conn.commit()


#--------------------------------------------------------------------------------

def helpAndQuit():
    print """
    Usage: crowd_tool.py COMMAND
    
    Commands:
        help
        reset       wipe the chars and reset all words to "unreviewed" status
        fixquotes
        mark-image-bad <image_id>
    """
    sys.exit(1)

if __name__ == '__main__':
    COMMANDS = ['-h','help','reset','fixquotes','mark-image-bad']
    args = sys.argv[1:]
    if len(args) == 0:
        helpAndQuit()
    command, args = args[0], args[1:]
    if command == 'help' or command == '-h' or command not in COMMANDS:
        helpAndQuit()
    elif command == 'fixquotes':
        print yellow('----------------------------------------------------------------------\\')
        fixQuotes(config.CROWD_DB)
        print yellow('----------------------------------------------------------------------/')
    elif command == 'mark-image-bad':
        print yellow('----------------------------------------------------------------------\\')
        image_id = args[0]
        markImageBad(config.CROWD_DB, image_id)
        print yellow('----------------------------------------------------------------------/')
    elif command == 'reset':
        print yellow('----------------------------------------------------------------------\\')
        resetCrowdDb(config.CROWD_DB)
        print yellow('----------------------------------------------------------------------/')

