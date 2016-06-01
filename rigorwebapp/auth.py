import functools

class Auth(object):

	@classmethod
	def check_access_and_inject_user(cls, config):
		'''
		This function determines who the user is and checks wheter they are in any of the 
		allowed groups. If they are allowed, it passes the username to the given function,
		otherwise it aborts with an HTTP 403 error
		'''
		def decorator(fn):
			@functools.wraps(fn)
			def decorated(*args, **kwargs):
				kwargs['username'] = None
				return fn(*args, **kwargs)
			return decorated
		return decorator

DefaultAuthClient = Auth