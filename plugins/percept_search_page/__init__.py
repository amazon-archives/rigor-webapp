from __future__ import division
import json
import urllib

from flask import request
from flask import render_template
from flask import abort
import jinja2

import rigor.config

import rigorwebapp.plugin
import rigorwebapp.utils
from rigorwebapp.utils import debug_detail, debug_main, debug_error
import rigorwebapp.auth

kPluginName = 'percept_search_page'

AuthClient = rigorwebapp.auth.DefaultAuthClient()

class PerceptSearchPagePlugin(rigorwebapp.plugin.BasePlugin):
	def __init__(self, backend, rigor_config):
		self.rigor_config = rigor_config
		self.backend = backend
		try:
			self.thumbnail_size_max = int(rigor_config.get("webapp","thumbnail_size_max"))
		except rigor.config.NoValueError:
			self.thumbnail_size_max = 128
		try:
			self.results_per_page = int(rigor_config.get("webapp","percept_search_page_results_per_page"))
		except rigor.config.NoValueError:
			self.results_per_page = 30

	def add_routes(self, app, backend, plugin_instances):
		@app.route('/db/<db_name>/perceptsearch')
		@AuthClient.check_access_and_inject_user(self.rigor_config)
		def percept_search_page(db_name, username=None):
			if not db_name in backend.db_names():
				abort(404)

			# clean up search params
			search_params = request.args.to_dict()
			search_params['page'] = max(1, int(search_params.get('page', 1)))  # human-readable page number starts at 1, not 0
			for int_param in ['random_nth', 'random_out_of']:
				if int_param in search_params:
					search_params[int_param] = int(search_params[int_param])
			param_whitelist = """
				page
				device_id
				collection_id
				hash
				annotation_domain
				annotation_model
				annotation_property
				percept_property
				locator
				random_nth
				random_out_of
			""".strip().split()
			for key in list(search_params.keys()):
				if not key in param_whitelist:
					del search_params[key]
				if search_params[key] == '':
					del search_params[key]

			search_results, total_count = backend.search_percepts(db_name=db_name, query=search_params, per_page=self.results_per_page, load_paths='tags')
			page_state = {
				'current_view': kPluginName,
				'username': username,
				kPluginName: dict(
					db_name=db_name,
					db_names=backend.db_names(),
					search_results=search_results,
					total_count=total_count,
					per_page=self.results_per_page,
					num_pages=int(total_count / self.results_per_page + 1),
					search_params=search_params,
				),
			}
			template_slots = rigorwebapp.plugin.TemplateSlots()
			rigorwebapp.plugin.augment_request(plugin_instances, page_state, template_slots)
			return render_template('standard_template.html', page_state=page_state, template_slots=template_slots)

	def augment_page_state(self, page_state):
		pass

	def augment_template_slots(self, page_state, template_slots):
		# add to navbar on all pages
		# first, figure out db_name
		try:
			db_name = page_state[page_state['current_view']]['db_name']
		except KeyError:
			try:
				db_name = self.rigor_config.get("webapp", "initial_db")
			except rigor.config.NoValueError:
				db_name='?'
		navbar_url = '/db/{}/perceptsearch'.format(db_name)
		template_slots.append('navbar_link', '<a href="{}">Percept Search</a>'.format(navbar_url))

		# if this isn't our own page, stop here
		if page_state['current_view'] != kPluginName:
			return

		template_slots.append('js_tail_path', '/static/plugins/percept_search_page/js/index.js')
		template_slots.append('css_path', '/static/plugins/percept_search_page/css/index.css')

		# build next/prev links for pagination navigation
		prev_link = None
		next_link = None
		page = page_state[kPluginName]['search_params']['page']
		prev_params = page_state[kPluginName]['search_params'].copy()
		prev_params['page'] -= 1
		next_params = page_state[kPluginName]['search_params'].copy()
		next_params['page'] += 1
		if prev_params['page'] >= 1:
			prev_link = 'perceptsearch?' + urllib.urlencode(prev_params)
		if next_params['page'] <= page_state[kPluginName]['num_pages']:
			next_link = 'perceptsearch?' + urllib.urlencode(next_params)
		template_slots.append('main_panel_pager_bar', dict(
			prev_link=prev_link,
			next_link=next_link,
			num_results=page_state[kPluginName]['total_count'],
			page_num=page,
			num_pages=page_state[kPluginName]['num_pages']
		))

		thumb_grid_template = """
			{% for percept in search_results %}
				<div class="searchResult">
					<a href="/db/{{db_name}}/percept/{{'{}'.format(percept.id)}}">
						{% if percept.x_size and percept.y_size: %}
						<img class="searchResultImg" src="{{percept.img_url+'?max_size='}}{{thumbnail_size_max}}" width="{{thumbsize(percept.x_size, percept.y_size)[0]}}" height="{{thumbsize(percept.x_size, percept.y_size)[1]}}" />
						{% else %}
							<div class="missingImage" style="height:{{thumbnail_size_max}}px; width:{{thumbnail_size_max}}px; display: block;"></div>
						{% endif %}
					</a>
					<div class="searchResultCaption">
						{% for tag in percept.tags %}
							<div class="tag"
								style="background: hsl({{tag_to_hue(tag)}}, 25%, 50%)"
								>
								{{tag}}
							</div>
						{% endfor %}
					</div>
				</div>
			{% endfor %}
		"""
		thumb_grid_template_context = dict(
			thumbsize = lambda width,height,maxsize=self.thumbnail_size_max: self.backend.percept_image_scaled_size((width,height),int(maxsize)),
			tag_to_hue = rigorwebapp.utils.hash_string_to_hue,
			thumbnail_size_max = self.thumbnail_size_max,
			**page_state[kPluginName]
		)
		template_slots.append('main_panel', jinja2.Template(thumb_grid_template).render(thumb_grid_template_context))

		search_form_template = """
			<div class="sidebarTitle">
				Search
			</div>
			<form id="perceptSearchForm">
				<div class="searchFormRow">
					<div class="searchFormRowLabel">
						Database
					</div>
					<select class="searchFormSelect" id="perceptSearchFormDbSelect">
						{% for this_db_name in db_names %}
							{% if this_db_name == db_name %}
								<option value={{this_db_name}} selected>{{this_db_name}}</option>
							{% else %}
								<option value={{this_db_name}}>{{this_db_name}}</option>
							{% endif %}
						{% endfor %}
					</select>
				</div>
				{% for facet in facets %}
					<div class="searchFormRow">
						<div class="searchFormRowLabel">{{facet.caption}}</div>
						{% if facet.get('help_text') %}
							<div class="searchFormRowHelp">{{facet.help_text}}</div>
						{% endif %}
						<input style="width:100%" type="text" id="{{facet.dom_id}}" value="{{facet.value}}"/>
					</div>
				{% endfor %}
				<div class="searchFormRow">
					<div class="searchFormRowLabel">Random subset</div>
					<span class="searchFormRowHelp">The </span>
					<input style="width:15%" type="text" id="perceptSearchFormRandomNth" value="{{random_nth_value}}"/>
					<span class="searchFormRowHelp">th percept out of each</span>
					<input style="width:15%" type="text" id="perceptSearchFormRandomOutOf" value="{{random_out_of_value}}"/>
				</div>
				<div class="searchFormButtonRow">
					<input class="button" type="submit" value="Search"/>
				</div>
			</form>
		"""
		search_params = page_state[kPluginName]['search_params']
		search_form_template_context = page_state[kPluginName].copy()
		search_form_template_context['random_nth_value'] = search_params.get('random_nth', '')
		search_form_template_context['random_out_of_value'] = search_params.get('random_out_of', '')
		search_form_template_context['facets'] = [
			dict(
				dom_id='perceptSearchFormLocator',
				value=search_params.get('locator', ''),
				caption='Locator',
				help_text='Use "*" as a wildcard.',
			),
			dict(
				dom_id='perceptSearchFormCollectionId',
				value=search_params.get('collection_id', ''),
				caption='Collection ID',
			),
			dict(
				dom_id='perceptSearchFormDeviceId',
				value=search_params.get('device_id', ''),
				caption='Device ID',
			),
			dict(
				dom_id='perceptSearchFormHash',
				value=search_params.get('hash', ''),
				caption='Percept hash',
			),
			dict(
				dom_id='perceptSearchFormAnnotationDomain',
				value=search_params.get('annotation_domain', ''),
				caption='Annotation domain',
			),
			dict(
				dom_id='perceptSearchFormAnnotationModel',
				value=search_params.get('annotation_model', ''),
				caption='Annotation model',
				help_text='Use "*" as a wildcard.',
			),
			dict(
				dom_id='perceptSearchFormAnnotationProperty',
				value=search_params.get('annotation_property', ''),
				caption='Annotation property and/or value',
				help_text='Format like "property", "=value", or "property=value".  Combine using "AND" or "OR", but not both: "a=aaa OR b=bbb".',
			),
			dict(
				dom_id='perceptSearchFormPerceptProperty',
				value=search_params.get('percept_property', ''),
				caption='Percept property and/or value',
				help_text='Format like "property", "=value", or "property=value".  Combine using "AND" or "OR", but not both: "a=aaa OR b=bbb".',
			),
		]
		template_slots.append('sidebar_top', jinja2.Template(search_form_template).render(search_form_template_context))
