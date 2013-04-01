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

@app.route('/api/v1/image/<id>', methods=['GET'])
def getImage(id):
    result = {
        'id': id
    }
    return jsonify(result)


#--------------------------------------------------------------------------------
# MAIN

if __name__ == '__main__':
    print '--------------------------------------------------------------------------------'
    debugMain('ready')
    app.run(debug=True, port=5000, host='0.0.0.0', use_evalex=False)

