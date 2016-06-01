from werkzeug.contrib.cache import BaseCache, SimpleCache
from rigorwebapp.utils import debug_error, debug_main

DefaultCacheClient = None

try:
	import uwsgi

	class UWSGICacheClient(BaseCache):
		'''
		Caching client that can be used to cache anything in memory using LRU eviction policy
		'''

		def add(self, key, value, timeout=None):
			'''
			Checks if the given key is in the cache. If it is, returns False and does not overwrite the value
			If the value is not in the cache, this method acts like set()
			'''
			if uwsgi.cache_exists(key):
				return False
			return self.set(key, value, timeout=timeout)

		def clear(self):
			'''
			Clears the cache of all keys/values and returns whether it was successful or not
			'''
			return uwsgi.cache_clear()

		def dec(self, key, delta=1):
			'''
			Decrements the value of the given key by delta. If the key does not exist, it is set with -delta
			Returns the new value of the key, or None for any errors
			'''
			try:
				delta = int(delta)
				if uwsgi.cache_exists(key):
					value = self.get(key) - delta
				else:
					value = -delta
				self.set(key, value)
				return value
			except Exception as err:
				debug_error(err)
				return None

		def delete(self, key):
			'''
			Deletes the given key from the cache. Returns True if the key existed and was deleted, False otherwise
			'''
			return uwsgi.cache_del(key) is not None

		def delete_many(self, *keys):
			'''
			Deletes multiple keys from the cache. Returns True if all the keys were deleted, False otherwise
			'''
			deleted_all = True
			for key in keys:
				deleted_all = deleted_all and self.delete(key)
			return deleted_all

		def get(self, key):
			'''
			Looks up the value of the given key. Returns the value if the key exists, None otherwise
			'''
			return uwsgi.cache_get(key)

		def get_dict(self, *keys):
			'''
			Returns a dictionary of the given keys with their corresponding values. Follows the same error handling as get()
			'''
			return {key: self.get(key) for key in keys}

		def get_many(self, *keys):
			'''
			Returns a list of values for the given keys. Follows the same error handling as get()
			'''
			return [self.get(key) for key in keys]
		
		def inc(self, key, delta=1):
			'''
			Increments the value of the given key by delta. If the key does not exist, it is set with delta
			Returns the new value of the key, or None for any errors
			'''
			try:
				delta = int(delta)
				if uwsgi.cache_exists(key):
					value = self.get(key) + delta
				else:
					value = delta
				self.set(key, value)
				return value
			except Exception as err:
				debug_error(err)
				return None

		def set(self, key, value, timeout=None):
			'''
			Adds a new key/value pair overwriting any existing value for the key. If timeout is given,
			sets the timeout on the key to be the given timeout, otherwise it does not set one
			Returns True if the key/value pair was set successfully, False otherwise
			'''
			try:
				if timeout is None:
					return uwsgi.cache_set(key, value)
				else:
					return uwsgi.cache_set(key, value, timeout)
			except Exception as e:
				debug_error(e)
				return False

		def set_many(self, mapping, timeout=None):
			'''
			Accepts a dictionary of key/value pairs and sets each key. Returns True if all keys have been set, False otherwise
			'''
			set_all = True
			for key, value in mapping.iteritems():
				set_all = set_all and self.set(key, value, timeout=timeout)
			return set_all

	DefaultCacheClient = UWSGICacheClient
	debug_main('Using uWSGI cache client')

except ImportError:
	debug_main('Cannot use uWSGI cache client. Using SimpleCache instead')
	DefaultCacheClient = SimpleCache

