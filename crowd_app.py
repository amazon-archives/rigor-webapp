#!/usr/bin/env python

from __future__ import division
import os
import sys
import time
import random
import json

import functools

from flask import Flask
from flask import render_template
from flask import send_file
from flask import jsonify
from flask import request
from flask import Response
from flask import abort
from flask import redirect

from utils import *
import backend
import config


#================================================================================
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


#================================================================================
# FLASK

app = Flask(__name__)
app.config['SECRET_KEY'] = 'fpqf94y1och48OUGWO38yfoo8yroihf28y982heD'


#================================================================================
# ROUTING

def simulateSlow():
    if config.CROWD_FAKE_SLOW_DELAY > 0:
        time.sleep(config.CROWD_FAKE_SLOW_DELAY)

#===========================================
# INDEX

@app.route('/')
# @use_basic_auth
def index():
    simulateSlow()
    return render_template('crowd_index.html')

#===========================================
# MISC API

@app.route('/stats')
def stats():
    """
    {
        words_raw: 29,
        words_approved: 29,
        words_sliced: 29,
        words_total: 104,
    }
    """
    simulateSlow()
    return jsonify(backend.getCrowdStats(config.CROWD_DB))

#===========================================
# IMAGES

@app.route('/images')
def images():
    simulateSlow()
    debugDetail('HTTP: /images')
    return render_template('crowd_images.html')

@app.route('/image/next')
def redirectToNextImage():
    """Redirect to the API call for an available image to approve.
    """
    simulateSlow()
    debugDetail('HTTP: /images/next')
    image_id = backend.getNextCrowdImage(config.CROWD_DB) # foo
    if image_id is None:
        abort(404)
    else:
        return redirect('/image/%s'%image_id)

@app.route('/image/<image_id>')
def getImage(image_id):
    """
    Return details about a particular image.
    """
    simulateSlow()
    debugDetail('HTTP: /images/%s'%image_id)
    image = backend.getImage(config.CROWD_DB, id=image_id)
    # rename image url to avoid collision
    image['url'] = image['url'].replace('/image/','/img/')
    # rename 'id' to 'image_id'
    image['image_id'] = image['id']
    del image['id']
    return jsonify(image)

@app.route('/img/<locator>.<ext>',methods=['GET'])
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

#===========================================
# WORD SLICER

@app.route('/words')
def words():
    """Render the main UI.
    """
    simulateSlow()
    return render_template('crowd_words.html')

# Also allow fetching with annotation_id in the url directly
#  which is useful when using Angular's HTML5 url mode.
# Angular will handle fetching the word's details so we can
#  just treat this like a plain old "/words" request.
@app.route('/words/<annotation_id>')
def wordsWithId(annotation_id):
    """Render the main UI.
    """
    simulateSlow()
    return render_template('crowd_words.html')

@app.route('/word/next')
def redirectToNextWord():
    """Redirect to the API call for an available word to slice.
    """
    simulateSlow()
    annotation_id = backend.getNextCrowdWord(config.CROWD_DB)
    if annotation_id is None:
        abort(404)
    else:
        return redirect('/word/%s'%annotation_id)

@app.route('/word/<annotation_id>')
def getWord(annotation_id):
    """
    Return details about a particular word.

    {
        annotation_id
        model
        image_id
        image_url  # added here, not from backend
        x_res      # size of the normalized cropped image
        y_res
        ext        # file extension
        chars = [
            {
                start  # normalized distance along the word from left to right. range 0-1
                end
                model  # a single character string
            },
            { ... }
        ]
    }
    """
    simulateSlow()
    word = backend.getCrowdWord(config.CROWD_DB, annotation_id)

    word['image_url'] = '/word/%s.%s' % (word['annotation_id'], word['ext'])
    del word['image_path']

    return jsonify(word)

@app.route('/word/<annotation_id>.<ext>')
def getWordImage(annotation_id, ext):
    """Fetch the cropped, normalized image for the given word.
    """
    simulateSlow()
    path = backend.getCrowdWordImagePath(config.CROWD_DB, annotation_id, ext)
    if os.path.exists(path):
        return send_file(path)
    else:
        abort(404)

@app.route('/word/save', methods=['POST'])
def saveWord():
    """Save a word by converting its slices into char annotations with real bounding boxes.
    The postdata should be a json object matching the one that getWord provides.
    """
    simulateSlow()
    wordData = json.loads(request.data)
    backend.saveCrowdWord(config.CROWD_DB, wordData)
    return 'ok'

#================================================================================
# MAIN

if __name__ == '__main__':
    print '--------------------------------------------------------------------------------'
    debugMain('ready')
    ARGS = sys.argv[1:]
    if len(ARGS) != 1:
        print 'usage: crowd_app.py PORTNUMBER'
        sys.exit(0)
    port = int(ARGS[0])
    app.run(debug=True, port=port, host='0.0.0.0', use_evalex=False)

