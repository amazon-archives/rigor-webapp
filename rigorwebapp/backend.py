import time
import datetime
import pytz
from utils import debug_error, debug_detail, debug_main
from dateutil import parser

import sqlalchemy
from sqlalchemy.orm import joinedload, lazyload
from sqlalchemy import update
from sqlalchemy import cast, Integer
from sqlalchemy import select, and_, or_, not_, func, distinct
import sqlalchemy.orm.exc

import cv2
import numpy as np

import rigor.database
import rigor.types
import rigor.perceptops

kEpoch = datetime.datetime(1970, 1, 1, tzinfo=pytz.UTC)

def utc_datetime_to_unix_seconds(dt):
	"""Converts a tz-aware datetime to a unix seconds-since-the-epoch (as a float).
	If dt is None, returns None.
	"""
	if dt is None:
		return None
	elif isinstance(dt,basestring):
		try:
			dt = rigor.utils.parse_timestamp(dt)
		except ValueError:
			dt = parser.parse(dt)
	if isinstance(dt,datetime.datetime):
		try:
			return (dt - kEpoch).total_seconds()
		except TypeError:
			debug_error("warning: dt is missing timezone: {}; this may be expected with sqlite".format(dt))
			dt = pytz.UTC.localize(dt)
			return (dt - kEpoch).total_seconds()
	else:
		debug_error("warning: couldn't figure out parsing: {} (type: {})".format(dt,type(dt)))
	return None

class Backend(object):
	def __init__(self, rigor_config):
		self.dbs = dict()  # mapping from db_name to rigor Database object
		self._perceptops = dict()  # mapping from db_name to rigor PerceptOps object

		self.rigor_config = rigor_config
		self._db_names = sorted([db_name.strip() for db_name in self.rigor_config.get('webapp', 'dbs').split(',')])
		driver = self.rigor_config.get('database', 'driver')
		if "sqlite" == driver:
			self._db_names = sorted(["!".join(db_name.split('/')).split(".db")[0] for db_name in self._db_names])

	def _encode_name_for_db(self, db_name):
		driver = self.rigor_config.get('database', 'driver')
		if "sqlite" == driver:
			db_name = "!".join(db_name.split("/")).split(".db")[0]
		return db_name

	def _real_name_for_db(self, db_name):
		driver = self.rigor_config.get('database', 'driver')
		if "sqlite" == driver:
			db_name = "/".join(db_name.split("!")) + ".db"
		return db_name

	def _ensure_db_exists(self, db_name):
		"""Make sure that the rigor Database object has been created for the given database name.
		"""
		assert db_name in self._db_names
		db_real_name = self._real_name_for_db(db_name)
		if not db_name in self.dbs:
			self.dbs[db_name] = rigor.database.Database(db_real_name, self.rigor_config)
		# XXX LOOK BELOW THIS LINE AT YOUR OWN RISK!
		try:
			with self.dbs[db_name].get_session(commit=False) as session:
				session.execute("SELECT 1")
		except Exception as e:
			debug_error("warning: invalid session returned from session_maker: {}".format(e))
			self.dbs[db_name] = rigor.database.Database(db_real_name, self.rigor_config)

	
	def _ensure_perceptops_exists(self, db_name):
		"""Make sure that the rigor PerceptOps object has been created for the given database name.
		"""
		assert db_name in self._db_names
		if not db_name in self._perceptops:
			self._perceptops[db_name] = rigor.perceptops.PerceptOps(self.rigor_config)

	def db_names(self):
		"""Returns a list of names of existing databases as configured in rigor.ini's "dbs" variable.
		"""
		return self._db_names

	def set_percept_field(self, db_name, percept_id, field, value):
		"""Sets a particular field of a percept to the given value.
		field: a string naming one column in the Percept table
		value: an appropriate type for that field
		"""
		self._ensure_db_exists(db_name)
		with self.dbs[db_name].get_session(commit=True) as session:
			session.execute(
				update(rigor.types.Percept).\
				where(rigor.types.Percept.id == percept_id).\
				values(**{field: value})
			)

	def set_annotation_field(self, db_name, annotation_id, field, value):
		"""Sets a particular field of a annotation to the given value.
		field: a string naming one column in the Annotation table
		value: an appropriate type for that field
		"""
		self._ensure_db_exists(db_name)
		with self.dbs[db_name].get_session(commit=True) as session:
			session.execute(
				update(rigor.types.Annotation).\
				where(rigor.types.Annotation.id == annotation_id).\
				values(**{field: value})
			)

	def delete_annotation(self, db_name, annotation_id):
		"""Sets a particular field of a annotation to the given value.
		field: a string naming one column in the Annotation table
		value: an appropriate type for that field
		"""
		self._ensure_db_exists(db_name)
		with self.dbs[db_name].get_session(commit=True) as session:
			session.query(rigor.types.AnnotationTag).filter_by(annotation_id=annotation_id).delete()
			session.query(rigor.types.AnnotationProperty).filter_by(annotation_id=annotation_id).delete()
			session.query(rigor.types.Annotation).filter_by(id=annotation_id).delete()

	def create_annotation(self, db_name, annotation):
		"""Create a new annotation and return its id.
		Annotation should be a dict with the following keys:
			boundary (optional)
			domain
			model
			confidence
			percept_id
			stamp
		For now this doesn't support properties and tags.
		"""
		self._ensure_db_exists(db_name)
		with self.dbs[db_name].get_session(commit=True) as session:
			tmp = rigor.types.Annotation()

			if annotation.get('boundary', None):
				tmp.boundary = annotation['boundary']
			tmp.domain = annotation['domain']
			tmp.model = annotation['model']
			tmp.confidence = annotation['confidence']
			tmp.percept_id = annotation['percept_id']
			tmp.stamp = datetime.datetime.fromtimestamp(annotation['stamp'])
			tmp.id = None

			if 'properties' in annotation:
				for k,v in annotation['properties'].items():
					tmp.properties[k] = rigor.types.AnnotationProperty(name=k, value=v)
			if 'tags' in annotation:
				tmp.tags = []
				for tag in annotation['tags']:
					tmp.tags.append(rigor.types.AnnotationTag(name=tag))

			session.add(tmp)
			session.commit()
			return tmp.id

	def percept_ids(self, db_name, limit=1000, offset=0):
		self._ensure_db_exists(db_name)
		self._ensure_perceptops_exists(db_name)
		with self.dbs[db_name].get_session(commit=False) as session:
			return [value[0] for value in session.query(rigor.types.Percept.id).distinct().limit(limit).offset(offset)]

	def percept_data(self, db_name, percept_id):
		"""Returns (mimetype, percept_data) for a given percept_id in the database with the given name.
		"""
		self._ensure_db_exists(db_name)
		self._ensure_perceptops_exists(db_name)
		with self.dbs[db_name].get_session(commit=False) as session:
			percept = session.query(rigor.types.Percept).\
							filter_by(id=str(percept_id)).\
							one()
			with self._perceptops[db_name].fetch(percept) as percept_buffer:
				return (percept.format, percept_buffer.read())

	def percept_image_scaled_size(self, percept_size, max_size):
		"""Returns (width, height)
		tuple is the width/height an image should be to fit within a
		max_size x max_size square, preserving the aspect ratio, and
		not up-sizing
		"""
		max_size = max(1, min(9999, max_size))
		scale_width = (max_size * 1.0) / percept_size[0]
		scale_height = (max_size * 1.0) / percept_size[1]
		scale = min(1.0, scale_width, scale_height)  # 1.0 prevents it from enlarging the image
		return (int(scale * percept_size[0]), int(scale * percept_size[1]))

	def percept_image_scaled(self, db_name, percept_id, max_size):
		"""Returns (mimetype, scaled_image_data)
		scaled_image_data is a version of the image which has been rescaled to
		fit within a max_size x max_size square, preserving aspect ratio.
		Shrinks the image if needed but will not enlarge it.
		Always re-encodes the image as a jpg.
		"""
		mimetype, data = self.percept_data(db_name, percept_id)
		array = np.asarray(bytearray(data), dtype=np.uint8)
		image = cv2.imdecode(array, -1)
		old_size = (image.shape[1], image.shape[0])
		new_size = self.percept_image_scaled_size(old_size, max_size)
		if old_size != new_size:
			image = cv2.resize(image, new_size, interpolation=cv2.INTER_AREA)
		encoded = cv2.imencode('.jpg', image)[1].tostring()
		return ('image/jpeg', encoded)

	def _prepare_serialized_percept(self, percept):
		"""Converts a serialized sqlalchemy dictionary to a plain python dictionary suitible for JSON.
		Converts datetimes to unix-seconds-since-epoch timestamps.
		Ensures that the sensors dictionary exists, even if empty.
		Returns a shallow copy; does not modify the input.
		"""
		# make a copy
		percept = percept.copy()
		if 'annotations' in percept:
			percept['annotations'] = [annotation.copy() for annotation in percept['annotations']]
		else:
			percept['annotations'] = []

		if not 'sensors' in percept:
			percept['sensors'] = dict()
		percept['stamp'] = utc_datetime_to_unix_seconds(percept['stamp'])
		for annotation in percept['annotations']:
			annotation['stamp'] = utc_datetime_to_unix_seconds(annotation['stamp'])
		return percept
	
	def _add_percept_img_url(self, percept, db_name):
		"""Adds 'img_url' to a percept dictionary.
		Returns a shallow copy; does not modify the input.
		"""
		percept = percept.copy()
		percept['img_url'] = '/api/v1/db/{}/percept/{}/data'.format(db_name, percept['id'])
		return percept

	def percept(self, db_name, percept_id=None):
		"""Returns a nested dictionary containing info about the percept and its tags, annotations, etc.
		If the percept does not exist, return None.
		"""
		self._ensure_db_exists(db_name)
		with self.dbs[db_name].get_session(commit=False).no_autoflush as session:
			try:
				percept = session.query(rigor.types.Percept).\
								filter_by(id=str(percept_id)).\
								one()
				properties = session.query(rigor.types.PerceptProperty).\
								filter(rigor.types.PerceptProperty.percept_id == str(percept_id)).\
								all()
				tags = session.query(rigor.types.PerceptTag).\
								filter(rigor.types.PerceptTag.percept_id == str(percept_id)).\
								all()
				collections = session.query(rigor.types.PerceptCollection).\
								filter(rigor.types.PerceptCollection.percept_id == str(percept_id)).\
								all()
				annotations = session.query(rigor.types.Annotation).filter(rigor.types.Annotation.percept_id == percept.id).all()
				if annotations:
					annotation_lookup = {}
					for annotation in annotations:
						annotation.properties = {}
						annotation.tags = []
						annotation_lookup[annotation.id] = annotation
					annotation_ids = annotation_lookup.keys()
					annotation_properties = session.query(rigor.types.AnnotationProperty).filter(rigor.types.AnnotationProperty.annotation_id.in_(annotation_ids)).all()
					annotation_tags = session.query(rigor.types.AnnotationTag).filter(rigor.types.AnnotationTag.annotation_id.in_(annotation_ids)).all()
					for annotation_property in annotation_properties:
						annotation_lookup[annotation_property.annotation_id].properties[annotation_property.name] = annotation_property
					for annotation_tag in annotation_tags:
						annotation_lookup[annotation_tag.annotation_id].tags.append(annotation_tag)
				percept.annotations = annotations
				percept.collections = collections
				percept.properties = {property.name: property for property in properties}
				percept.tags = tags

			except sqlalchemy.orm.exc.NoResultFound:
				return None
			percept = self._prepare_serialized_percept(percept.serialize())
			percept = self._add_percept_img_url(percept, db_name)
			return percept

	def search_percepts(self, db_name, query, per_page=30, load_paths=None):
		"""Searches for percepts and returns (percepts, total_count).
		total_count is the number of matches in the database (ignoring pagination limits)
		query: a dict containing these optional keys:
			page: an int starting at 1
			device_id: string
			hash: string
			annotation_domain: string
			locator: string.  If it contains '*', use it with LIKE (case-sensitive wildcard search)
			annotation_model: string.  If it contains '*', use it with LIKE (case-sensitive wildcard search)
			annotation_property: string in the format "key" or "key=value" or "key=value OR key=value OR key=value"
			percept_property: string in the format "key" or "key=value" or "key=value OR key=value OR key=value"
			random_nth: int
			random_out_of: int.  Together, these search for the (random_nth) percept out of each (random_out_of).
		annotation_property can use either "AND" or "OR", but not both.
		per_page: limits the result to this many rows.  use None for no limit.
		load_paths: which collections to eager-load?  Default is None.
			Can be a single string like '*' or 'annotations' or 'annotations.properties',
			or a list of such strings.
		"""
		page_num = query.get('page', 1) - 1 # convert human page numbers (starting from 1) to machine page numbers (from 0)
		self._ensure_db_exists(db_name)
		with self.dbs[db_name].get_session(commit=False) as session:
			# http://docs.sqlalchemy.org/en/rel_1_0/core/tutorial.html

			# we build two queries -- one if we can do all of our queries against just percepts, otherwise merging with annotations; TODO: this is not the best approach, it would be better as one query that we're just a little bit smarter about...
			sql = list()
			need_annotations = False
			# annotation facets
			if 'annotation_domain' in query:
				sql.append(rigor.types.Annotation.domain == query['annotation_domain'])
				need_annotations = True
			if 'annotation_model' in query:
				need_annotations = True
				annotation_model = query['annotation_model']
				if '*' in annotation_model:
					annotation_model = annotation_model.replace('*','%')
					sql.append(rigor.types.Annotation.model.like(annotation_model))
				else:
					sql.append(rigor.types.Annotation.model == annotation_model)

			# annotation properties
			# NOTE: this does not do 'tags' (it never says it does, but still, searching properties on keys regardless of values screams "tags"), and as a function it's still kind of scary. and should maybe be its own function.
			annotation_property_criteria = []
			if 'annotation_property' in query:
				annotation_property_join_mode = None
				annotation_property_string = query['annotation_property']
				annotation_property_stringlower = annotation_property_string.lower()
				# input is a string like "a=aaa OR b=bbb OR c=ccc"
				# output is a query clause like
				#    (name="a" AND value="aaa") OR (name="b" AND value="bbb") OR (...etc...)
				# not allowed to use both in a single query
				or_string = ' or '
				and_string = ' and '
				if or_string in annotation_property_stringlower and not and_string in annotation_property_stringlower:
					annotation_property_join_mode = or_
					annotation_property_join_string = or_string
				elif and_string in annotation_property_stringlower and not or_string in annotation_property_stringlower:
					annotation_property_join_mode = and_
					annotation_property_join_string = and_string
				else:
					annotation_property_join_mode = None
				if annotation_property_join_mode:
					clauses = annotation_property_string.replace(annotation_property_join_string.upper(), annotation_property_join_string).split(annotation_property_join_string)
					clauses = [clause.strip() for clause in clauses]
				else:
					# a list with a single clause
					clauses = [annotation_property_string]
				for clause in clauses:
					if '=' in clause:
						name, value = [piece.strip() for piece in clause.split('=', 1)]
					else:
						name = clause.strip()
						value = None
					if name and value:
						annotation_property_criteria.append(and_(
							rigor.types.AnnotationProperty.name == name,
							rigor.types.AnnotationProperty.value == value,
						))
					elif name:
						annotation_property_criteria.append(rigor.types.AnnotationProperty.name == name)
					elif value:
						annotation_property_criteria.append(rigor.types.AnnotationProperty.value == value)
			if annotation_property_criteria:
				need_annotations = True
				if annotation_property_join_mode: # either or_ or and_
					tmp = True if annotation_property_join_mode == and_ else False
					for criteria in annotation_property_criteria:
						tmp = annotation_property_join_mode(criteria, tmp)
				else: # None
					tmp = annotation_property_criteria[0]
				sql.append(tmp)
				sql.append(rigor.types.AnnotationProperty.annotation_id == rigor.types.Annotation.id)

			# percept properties
			# NOTE: this does not do 'tags' (it never says it does, but still, searching properties on keys regardless of values screams "tags"), and as a function it's still kind of scary. and should maybe be its own function.
			percept_property_criteria = []
			if 'percept_property' in query:
				percept_property_join_mode = None
				percept_property_string = query['percept_property']
				percept_property_stringlower = percept_property_string.lower()
				# input is a string like "a=aaa OR b=bbb OR c=ccc"
				# output is a query clause like
				#    (name="a" AND value="aaa") OR (name="b" AND value="bbb") OR (...etc...)
				# not allowed to use both in a single query
				or_string = ' or '
				and_string = ' and '
				if or_string in percept_property_stringlower and not and_string in percept_property_stringlower:
					percept_property_join_mode = or_
					percept_property_join_string = or_string
				elif and_string in percept_property_stringlower and not or_string in percept_property_stringlower:
					percept_property_join_mode = and_
					percept_property_join_string = and_string
				else:
					percept_property_join_mode = None
				if percept_property_join_mode:
					clauses = percept_property_string.replace(percept_property_join_string.upper(), percept_property_join_string).split(percept_property_join_string)
					clauses = [clause.strip() for clause in clauses]
				else:
					# a list with a single clause
					clauses = [percept_property_string]
				for clause in clauses:
					if '=' in clause:
						name, value = [piece.strip() for piece in clause.split('=', 1)]
					else:
						name = clause.strip()
						value = None
					if name and value:
						percept_property_criteria.append(and_(
							rigor.types.PerceptProperty.name == name,
							rigor.types.PerceptProperty.value == value,
						))
					elif name:
						percept_property_criteria.append(rigor.types.PerceptProperty.name == name)
					elif value:
						percept_property_criteria.append(rigor.types.PerceptProperty.value == value)
			if percept_property_criteria:
				if percept_property_join_mode: # either or_ or and_
					tmp = True if percept_property_join_mode == and_ else False
					for criteria in percept_property_criteria:
						tmp = percept_property_join_mode(criteria, tmp)
				else: # None
					tmp = percept_property_criteria[0]
				sql.append(tmp)
				sql.append(rigor.types.PerceptProperty.percept_id == rigor.types.Percept.id)

			# percept collection
			order_by_collections = False
			if 'collection_id' in query:
				collection_id = query['collection_id']
				sql.append(rigor.types.PerceptCollection.collection_id == collection_id)
				sql.append(rigor.types.PerceptCollection.percept_id == rigor.types.Percept.id)
				if need_annotations:
					sql.append(rigor.types.Percept.id == rigor.types.Annotation.percept_id)
				order_by_collections = True

			# percept metadata
			if 'device_id' in query or 'hash' in query or 'locator' in query:
				if 'locator' in query:
					locator = query['locator']
					if '*' in locator:
						locator = locator.replace('*','%')
						sql.append(rigor.types.Percept.locator.like(locator))
					else:
						sql.append(rigor.types.Percept.locator == locator)
				if 'device_id' in query:
						sql.append(rigor.types.Percept.device_id == query['device_id'])
				if 'hash' in query:
						sql.append(rigor.types.Percept.hash == query['hash'])
				if need_annotations:
					sql.append(rigor.types.Percept.id == rigor.types.Annotation.percept_id)

			# random subsets TODO THIS IS BROKEN I AM SORRY MAYBE PG8000 VS PYGRESQL????
			if 'random_nth' in query and 'random_out_of' in query:
				# in case the user asks for the 3rd out of every 3, search for the 0th instead
				nth = query['random_nth'] % query['random_out_of']
				# hash function: int(fractional_part_of(id * irrational) * out_of) == nth?
				# note that cast rounds rather than doing a floor, on postgres at least, so we have to - 0.5
				irrational = 2 ** 0.5
				sql.append(cast(((rigor.types.Percept.id * irrational) - cast(rigor.types.Percept.id * irrational - 0.5, Integer)) * query['random_out_of'] - 0.5, Integer) == nth)

		need_percepts = not need_annotations and sql

		# control sqlalchemy eager loading
		# TODO: this is only needed in some cases and there's a fair amount of duplicated code below
		joinedloads = []
		if load_paths:
			if isinstance(load_paths, str) or isinstance(load_paths, unicode):
				load_paths = [load_paths]
			for load_path in load_paths:
				j = None
				for chunk in load_path.split('.'):
					if not j:
						j = joinedload(chunk)
					else:
						j = j.joinedload(chunk)
				joinedloads.append(j)

		if not need_annotations and not need_percepts:
			rows = session.execute("SELECT count(id) from percept")
			for row in rows:
				total_count = row[0]
			if not total_count:
				return ((), 0)
			percepts = session.query(rigor.types.Percept)
			if joinedloads:
				percepts = percepts.options(*joinedloads)
			percepts = percepts.order_by(rigor.types.Percept.id)
			if per_page:
				percepts = percepts.offset(page_num*per_page).limit(per_page)
			percepts = percepts.all()
		else:
			core_query = and_(*sql)
			if need_annotations:
				search = distinct(rigor.types.Annotation.percept_id)
				if order_by_collections:
					order = rigor.types.PerceptCollection.collection_n
				else:
					order = rigor.types.Annotation.percept_id
			else:
				search = rigor.types.Percept.id
				if order_by_collections:
					order = rigor.types.PerceptCollection.collection_n
				else:
					order = rigor.types.Percept.id
			rows = session.execute(select([func.count(search)]).where(core_query))
			for row in rows:
				total_count = row[0]
			if not total_count:
				return ((), 0)
			core_query = select([search]).where(core_query).order_by(order)
			if per_page:
				core_query = core_query.offset(page_num * per_page).limit(per_page)
			rows = session.execute(core_query)
			percept_ids = [row[0] for row in rows]
			percepts = session.query(rigor.types.Percept)
			if joinedloads:
				percepts = percepts.options(*joinedloads)
			if order_by_collections:
				percepts = percepts.filter(rigor.types.Percept.id.in_(percept_ids)).join(rigor.types.PerceptCollection).filter(rigor.types.PerceptCollection.collection_id == query['collection_id']).order_by(rigor.types.PerceptCollection.collection_n).all()
				sql.append(rigor.types.PerceptCollection.collection_id == collection_id)
				sql.append(rigor.types.PerceptCollection.percept_id == rigor.types.Percept.id)
			else:
				percepts = percepts.filter(rigor.types.Percept.id.in_(percept_ids)).order_by(rigor.types.Percept.id).all()
		percepts = [self._prepare_serialized_percept(percept.serialize()) for percept in percepts]
		percepts = [self._add_percept_img_url(percept, db_name) for percept in percepts]
		return (percepts, total_count)

	def count_percepts(self, db_name):
		self._ensure_db_exists(db_name)
		with self.dbs[db_name].get_session(commit=False) as session:
			return session.query(rigor.types.Percept).count()
