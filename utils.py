#!/usr/bin/env python

from __future__ import division

#--------------------------------------------------------------------------------

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
def colorText(s, color):
    global USE_COLOR
    if not USE_COLOR: return s
    # color should be a string from COLORS
    return '\033[%sm%s\033[%sm' % (COLORS[color], s, COLORS['reset'])
def red(s):     return colorText(s, 'red')
def green(s):   return colorText(s, 'green')
def yellow(s):  return colorText(s, 'yellow')
def blue(s):    return colorText(s, 'blue')
def magenta(s): return colorText(s, 'magenta')
def cyan(s):    return colorText(s, 'cyan')
def white(s):   return colorText(s, 'white')

def indent(n, s):
    if type(s) not in (str, unicode):
        s = str(s)
    return ' '*n + s.replace('\n', '\n'+' '*n)
def addTag(tag, s):
    if type(s) not in (str, unicode):
        s = str(s)
    return tag + s.replace('\n', '\n'+tag)
def addTagFirstLineOnly(tag, s):
    if type(s) not in (str, unicode):
        s = str(s)
#     return tag + s.replace('\n', '\n'+' '*len(decolor(tag)))
    return tag + s.replace('\n', '\n'+' '*len(tag))

def debugMain(s):   print yellow(  addTag('[main] ', s))
def debugDetail(s): print cyan(    addTag('[main] --- ', s))
def debugSQL(s):    print magenta( addTag('[sql] --- ', s))
def debugCmd(s):    print green(   addTag('[cmd] --- ', s))
def debugError(s):  print red(     addTag('[error] ', s))

def readfile(fn):
    f = open(fn, 'r'); data = f.read(); f.close(); return data
def writefile(fn, data):
    f = open(fn, 'w'); f.write(data); f.close()

def tryIntOr(input, num):
    try:
        return int(input)
    except:
        return num

