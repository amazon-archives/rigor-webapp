#!/usr/bin/env python

from __future__ import division
import os
import sys
import time
import random

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
app.config['SECRET_KEY'] = 'fpqf94y1och48OUGWO38yfoo8yroihf28y982heD'


#--------------------------------------------------------------------------------
# ROUTING

def simulateSlow():
    if config.FAKE_SLOW_DELAY > 0:
        time.sleep(config.FAKE_SLOW_DELAY)

@app.route('/')
# @use_basic_auth
def index():
    simulateSlow()
    return render_template('crowd_index.html')

@app.route('/stats')
# @use_basic_auth
def stats():
    simulateSlow()
    stats = dict(
        photos_to_do = 24,
        photos_total = 204,
        words_to_do = 24,
        words_total = 452
    )
    return jsonify(stats)

@app.route('/photos')
# @use_basic_auth
def photos():
    simulateSlow()
    return render_template('crowd_index.html')

@app.route('/words')
# @use_basic_auth
def words():
    simulateSlow()
    return render_template('crowd_words.html')

@app.route('/word/next')
def redirectToNextWord():
    simulateSlow()
    annotation_id = random.randint(100,200)
    return redirect('/word/%s'%annotation_id)

@app.route('/word/<annotation_id>')
def getWord(annotation_id):
    simulateSlow()
    word = dict(
        annotation_id = annotation_id,
        word_id = 12345,
        model = "SALE",
        chars = [
            {
                "start": 0.1,
                "end": 0.2,
                "model": "S",
            },
            {
                "start": 0.3,
                "end": 0.4,
                "model": "A",
            },
            {
                "start": 0.5,
                "end": 0.6,
                "model": "L",
            },
            {
                "start": 0.7,
                "end": 0.8,
                "model": "E",
            },
        ]
    )
    return jsonify(word)

#--------------------------------------------------------------------------------
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

