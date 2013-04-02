#!/usr/bin/env python

from __future__ import division
import os
import random
import time
import json
import pprint

from flask import Flask
from flask import render_template
from flask import send_from_directory
from flask import jsonify
from flask import request
from flask import redirect
from flask import url_for
from flask import flash
from flask import abort

from utils import *
import backend

#--------------------------------------------------------------------------------
# FLASK

app = Flask(__name__)
app.config['SECRET_KEY'] = 'fq348fnylq84ylnqx48yq3xlg8nlqy348q'

#--------------------------------------------------------------------------------
# MODELS

#--------------------------------------------------------------------------------
# ROUTING

@app.route('/')
def index():
    return render_template('index.html')

# http://localhost:5000/api/v1/search?a=1&has_tags=sign,sightpal&exclude_tags=hard&max_count=3
@app.route('/api/v1/search', methods=['GET'])
def searchImages():
    queryDict = {}
    keyWhitelist = 'source sensor has_tags exclude_tags max_count page'.split()
    for key,val in request.values.items():
        if key in keyWhitelist:
            if type(val) == unicode:
                val = val.encode('utf-8')
            queryDict[key] = val
    if 'has_tags' in queryDict:
        queryDict['has_tags'] = queryDict['has_tags'].split(',')
    if 'exclude_tags' in queryDict:
        queryDict['exclude_tags'] = queryDict['exclude_tags'].split(',')
    if 'max_count' in queryDict:
        queryDict['max_count'] = int(queryDict['max_count'])
    if 'page' in queryDict:
        queryDict['page'] = int(queryDict['page'])
    debugMain('searchImages: %s'%queryDict)
    result = backend.searchImages(queryDict)
    return jsonify(result=result)

# http://localhost:5000/api/v1/image/23659
@app.route('/api/v1/image/<id>', methods=['GET'])
def getImage(id):
    result = backend.getImage(id=id)
    debugMain('getImage.  id = %s'%id)
    debugDetail(result)
    return jsonify(result)


#--------------------------------------------------------------------------------
# MAIN

if __name__ == '__main__':
    print '--------------------------------------------------------------------------------'
    debugMain('ready')
    app.run(debug=True, port=5000, host='0.0.0.0', use_evalex=False)

