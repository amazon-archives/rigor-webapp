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

#--------------------------------------------------------------------------------
# GENERIC UTILS

COLORS = {'red':'31',
          'green': '32',
          'yellow': '33',
          'blue': '34',
          'magenta': '35',
          'cyan': '36',
          'white': '37',
          'reset': '39'}
USE_COLOR = True
DEBUG = True
def colorText(s,color):
    global USE_COLOR
    if not USE_COLOR: return s
    # color should be a string from COLORS
    return '\033[%sm%s\033[%sm'%(COLORS[color],s,COLORS['reset'])
def red(s):     return colorText(s,'red')
def green(s):   return colorText(s,'green')
def yellow(s):  return colorText(s,'yellow')
def blue(s):    return colorText(s,'blue')
def magenta(s): return colorText(s,'magenta')
def cyan(s):    return colorText(s,'cyan')
def white(s):   return colorText(s,'white')

def indent(n,s):
    if type(s) not in (str,unicode):
        s = str(s)
    return ' '*n + s.replace('\n','\n'+' '*n)
def addTag(tag,s):
    if type(s) not in (str,unicode):
        s = str(s)
    return tag + s.replace('\n','\n'+tag)
def addTagFirstLineOnly(tag,s):
    if type(s) not in (str,unicode):
        s = str(s)
    return tag + s.replace('\n','\n'+' '*len(decolor(tag)))

def debugMain(s):   print yellow(  addTag('[main] ',s))
def debugDetail(s): print blue(    addTag('[main] --- ',s))
def debugSQL(s):    print magenta( addTag('[sql] --- ',s))
def debugError(s):  print red(     addTag('[error] ',s))

def readfile(fn):
    f = open(fn,'r'); data = f.read(); f.close(); return data
def writefile(fn,data):
    f = open(fn,'w'); f.write(data); f.close()

def tryIntOr(input,num):
    try:
        return int(input)
    except:
        return num

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

#--------------------------------------------------------------------------------
# MAIN

if __name__ == '__main__':
    print '--------------------------------------------------------------------------------'
    debugMain('ready')
    app.run(debug=True, port=5000, host='0.0.0.0', use_evalex=False)

