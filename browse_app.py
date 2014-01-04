#!/usr/bin/env python

from __future__ import division
import os
import sys
import time

import functools

from flask import Flask
from flask import render_template
from flask import send_file
from flask import jsonify
from flask import request
from flask import Response
from flask import abort

from utils import *
import backend
import config


#--------------------------------------------------------------------------------
# HELPERS

def check_auth(username, password):
    """This function is called to check if a username /
    password combination is valid.
    """
    return username == 'blindsight' and password == 'rigor!!!!!'

def authenticate():
    """Sends a 401 response that enables basic auth"""
    return Response(
        'Could not verify your access level for that URL.\n'
        'You have to login with proper credentials', 401,
        {'WWW-Authenticate': 'Basic realm="Login Required"'}
    )

def use_basic_auth(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    return decorated


#--------------------------------------------------------------------------------
# FLASK

app = Flask(__name__)
app.config['SECRET_KEY'] = 'fq348fnylq84ylnqx48yq3xlg8nlqy348q'


#--------------------------------------------------------------------------------
# ROUTING

def simulateSlow():
    if config.FAKE_SLOW_DELAY > 0:
        time.sleep(config.FAKE_SLOW_DELAY)


@app.route('/')
@use_basic_auth
def index():
    simulateSlow()
    return render_template('browse.html')

@app.route('/tagtest')
@use_basic_auth
def tagTest():
    simulateSlow()
    return render_template('tagtest.html')

@app.route('/thumb/<locator>.<ext>',methods=['GET'])
def getThumbFile(locator, ext):
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
@use_basic_auth
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
@use_basic_auth
def searchImages():
    simulateSlow()
    queryDict = {}
    keyWhitelist = 'database_name has_tags exclude_tags max_count page'.split()
    # TODO: throw error if certain keys are missing
    for key, val in request.values.items():
        if key in keyWhitelist:
            if type(val) == unicode:
                val = val.encode('utf-8')
            queryDict[key] = val
        else:
            debugDetail('discarding unknown key: %s = %s' % (key, val))
    if 'has_tags' in queryDict:
        if not queryDict['has_tags']:
            del queryDict['has_tags']
        else:
            queryDict['has_tags'] = queryDict['has_tags'].split(',')
    if 'exclude_tags' in queryDict:
        if not queryDict['exclude_tags']:
            del queryDict['exclude_tags']
        else:
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
@use_basic_auth
def getDatabaseNames():
    simulateSlow()
    return jsonify(d=backend.getDatabaseNames())

# http://ea:5000/api/v1/db/rigor/image/23659
@app.route('/api/v1/db/<database_name>/image/<id>', methods=['GET'])
@use_basic_auth
def getImage(database_name, id):
    simulateSlow()
    result = backend.getImage(database_name=database_name, id=id)
    debugMain('getImage.  id = %s' % id)
    return jsonify(result)

# http://ea:5000/api/v1/db/rigor/image/afa567f9f55b4283a1ead5682637ed4e/annotation
@app.route('/api/v1/db/<database_name>/image/<id>/annotation', methods=['GET'])
@use_basic_auth
def getImageAnnotations(database_name, id):
    simulateSlow()
    result = backend.getImageAnnotations(database_name=database_name, id=id)
    debugMain('getImageAnnotations.  id = %s' % id)
    return jsonify(d=result)

@app.route('/api/v1/db/<database_name>/image/<id>/annotation/<annotation_id>/tag', methods=['GET'])
@use_basic_auth
def getAnnotationTags(database_name, id, annotation_id):
    simulateSlow()
    result = backend.getAnnotationTags(database_name=database_name, id=annotation_id)
    debugMain('getAnnotationTags.  id = %s' % id)
    return jsonify(d=result)

# http://ea:5000/api/v1/db/rigor/tag
@app.route('/api/v1/db/<database_name>/tag', methods=['GET'])
@use_basic_auth
def getTags(database_name):
    simulateSlow()
    return jsonify(d=backend.getTags(database_name))

@app.route('/api/v1/db/<database_name>/save_annotations', methods=['POST'])
@use_basic_auth
def saveAnnotations(database_name):
    # expects this json as post data:
    # {'annotations': [ ... ]}
    # where each annotation has a '_edit_state' field which is either 'edited', 'new', or 'deleted'.
    simulateSlow()
    annotations = request.json['annotations']
    backend.saveAnnotations(database_name,annotations)
    return jsonify({'success': True})


#--------------------------------------------------------------------------------
# MAIN

if __name__ == '__main__':
    print '--------------------------------------------------------------------------------'
    debugMain('ready')
    ARGS = sys.argv[1:]
    if len(ARGS) != 1:
        print 'usage: flask_app.py PORTNUMBER'
        sys.exit(0)
    port = int(ARGS[0])
    app.run(debug=True, port=port, host='0.0.0.0', use_evalex=False)

