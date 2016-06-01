#!/usr/bin/env python

from __future__ import division
import json
import hashlib
import time

kColors = {
	'red':'31',
	'green': '32',
	'yellow': '33',
	'blue': '34',
	'magenta': '35',
	'cyan': '36',
	'white': '37',
	'reset': '39',
}
kUseColor = True

def color_text(string, color):
	# color should be a string from kColors
	if not kUseColor:
		return string
	return '\033[%sm%s\033[%sm' % (kColors[color], string, kColors['reset'])

def red(string):
	return color_text(string, 'red')
def green(string):
	return color_text(string, 'green')
def yellow(string):
	return color_text(string, 'yellow')
def blue(string):
	return color_text(string, 'blue')
def magenta(string):
	return color_text(string, 'magenta')
def cyan(string):
	return color_text(string, 'cyan')
def white(string):
	return color_text(string, 'white')

def indent(num_spaces, string):
	if type(string) not in (str, unicode):
		string = str(string)
	return ' '*num_spaces + string.replace('\n', '\n'+' '*num_spaces)
def add_tag(tag, string):
	if type(string) not in (str, unicode):
		string = str(string)
	return tag + string.replace('\n', '\n'+tag)
def add_tag_first_line_only(tag, string):
	if type(string) not in (str, unicode):
		string = str(string)
	return tag + string.replace('\n', '\n'+' '*len(tag))

def debug_main(string):
	print yellow(add_tag('[main] ', string))
def debug_detail(string):
	print cyan(add_tag('[main] --- ', string))
def debug_sql(string):
	print magenta(add_tag('[sql] --- ', string))
def debug_cmd(string):
	print green(add_tag('[cmd] --- ', string))
def debug_error(string):
	print red(add_tag('[error] ', string))
def debug_json(json_obj):
	print white(add_tag('[json] ', json.dumps(json_obj, indent=4, sort_keys=True)))

def readfile(filename):
	file_object = open(filename, 'r')
	data = file_object.read()
	file_object.close()
	return data
def writefile(filename, data):
	file_object = open(filename, 'w')
	file_object.write(data)
	file_object.close()

def hash_string_to_hue(string):
	"""Converts an arbitrary string to a unique hue (an integer between 0 and 360) by hashing it.
	Useful for giving unique CSS colors to tags, etc.
	"""
	return str(int(ord(hashlib.md5(string).digest()[0]) / 255 * 360))

def unix_timestamp_to_string(unix_seconds, format_string):
	"""Converts a timestamp (in unix seconds since the epoch) to a human-readable string in UTC.
	format_string should be in a format that time.strftime understands.
	"""
	if (unix_seconds is None):
		return None
	return time.strftime(format_string, time.gmtime(unix_seconds))
