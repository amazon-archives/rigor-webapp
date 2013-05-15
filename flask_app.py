#!/usr/bin/env python

from __future__ import division
import os
import time

from flask import Flask
from flask import render_template
from flask import send_file
from flask import jsonify
from flask import request
from flask import abort

# from flask import flash
# from flask import send_from_directory
# from flask import redirect
# from flask import url_for

from utils import *
import backend
import config

#--------------------------------------------------------------------------------
# FLASK

app = Flask(__name__)
app.config['SECRET_KEY'] = 'fq348fnylq84ylnqx48yq3xlg8nlqy348q'

#--------------------------------------------------------------------------------
# MODELS

#--------------------------------------------------------------------------------
# ROUTING

def simulateSlow():
    if config.FAKE_SLOW_DELAY > 0:
        time.sleep(config.FAKE_SLOW_DELAY)


@app.route('/')
def index():
    simulateSlow()
    return render_template('browse.html')

@app.route('/thumb/<locator>.<ext>',methods=['GET'])
def getThumbFile(locator, ext):
    simulateSlow()
    locator = locator.replace('-','').replace('/','').replace('..','')
    ext = ext.replace('/','').replace('..','')
    path = '/data/rigor/thumbnails/200x200/%s/%s/%s.%s' % (
                locator[:2],
                locator[2:4],
                locator.replace('-',''),
                ext
            )
    if os.path.exists(path):
        return send_file(path)
    else:
        abort(404)

@app.route('/image/<locator>.<ext>',methods=['GET'])
def getImageFile(locator, ext):
    simulateSlow()
    locator = locator.replace('-','').replace('/','').replace('..','')
    ext = ext.replace('/','').replace('..','')
    path = '/data/rigor/images/%s/%s/%s.%s' % (
                locator[:2],
                locator[2:4],
                locator.replace('-',''),
                ext
            )
    if os.path.exists(path):
        return send_file(path)
    else:
        abort(404)


# http://ea:5000/api/v1/search?a=1&database_name=rigor&has_tags=sign,sightpal&exclude_tags=hard&max_count=3
@app.route('/api/v1/search', methods=['GET'])
def searchImages():
    simulateSlow()
    queryDict = {}
    keyWhitelist = 'database_name source sensor has_tags exclude_tags max_count page'.split()
    # TODO: throw error if certain keys are missing
    for key, val in request.values.items():
        if key in keyWhitelist:
            if type(val) == unicode:
                val = val.encode('utf-8')
            queryDict[key] = val
        else:
            debugDetail('discarding unknown key: %s = %s' % (key, val))
    if 'has_tags' in queryDict:
        queryDict['has_tags'] = queryDict['has_tags'].split(',')
    if 'exclude_tags' in queryDict:
        queryDict['exclude_tags'] = queryDict['exclude_tags'].split(',')
    if 'max_count' in queryDict:
        queryDict['max_count'] = int(queryDict['max_count'])
    if 'page' in queryDict:
        queryDict['page'] = int(queryDict['page'])
    debugMain('searchImages: %s' % queryDict)
    full_count, result = backend.searchImages(queryDict)
    #print pprint.pformat(result)
    return jsonify(full_count = full_count, images=result)


# http://ea:5000/api/v1/db
@app.route('/api/v1/db', methods=['GET'])
def getDatabaseNames():
    simulateSlow()
    return jsonify(d=backend.getDatabaseNames())

# http://ea:5000/api/v1/db/rigor/image/23659
@app.route('/api/v1/db/<database_name>/image/<locator>', methods=['GET'])
def getImage(database_name, locator):
    simulateSlow()
    result = backend.getImage(database_name=database_name, locator=locator)
    debugMain('getImage.  locator = %s' % locator)
    return jsonify(result)

# http://ea:5000/api/v1/db/rigor/image/afa567f9f55b4283a1ead5682637ed4e/annotation
@app.route('/api/v1/db/<database_name>/image/<locator>/annotation', methods=['GET'])
def getImageAnnotations(database_name, locator):
    simulateSlow()
    result = backend.getImageAnnotations(database_name=database_name, locator=locator)
    debugMain('getImageAnnotations.  locator = %s' % locator)
    return jsonify(d=result)

# http://ea:5000/api/v1/db/rigor/source
@app.route('/api/v1/db/<database_name>/source', methods=['GET'])
def getSources(database_name):
    simulateSlow()
    return jsonify(d=backend.getSources(database_name))


# http://ea:5000/api/v1/db/rigor/sensor
@app.route('/api/v1/db/<database_name>/sensor', methods=['GET'])
def getSensors(database_name):
    simulateSlow()
    return jsonify(d=backend.getSensors(database_name))


#--------------------------------------------------------------------------------
# MAIN

if __name__ == '__main__':
    print '--------------------------------------------------------------------------------'
    debugMain('ready')
    app.run(debug=True, port=5000, host='0.0.0.0', use_evalex=False)

