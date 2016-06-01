from setuptools import setup
from glob import glob
import os.path
import sys

scripts = glob(os.path.join('tools', '*.py'))
scripts.extend(glob(os.path.join('bin', '*.py')))

setup(
		name = 'rigor-webapp',
		version = '2.1.0',
		description = 'A Flask front-end for the Rigor testing framework',
		long_description = 'Rigor is a framework for managing labeled data, and for testing algorithms against that data in a systematic fashion.',
		maintainer = 'David Wallace',
		maintainer_email = 'dtw@a9.com',
		url = 'https://github.com/blindsightcorp/rigor-webapp',
		license = 'BSD License',
		install_requires = ['SQLAlchemy >= 0.7.6', 'alembic >= 0.7.3'],
		tests_require = ['pytest >= 2.5.2', 'moto >= 0.4'],
		packages = ('rigor-webapp', ),
		package_dir = { 'rigor-webapp': 'bin', },
		scripts=scripts,
		classifiers = [
			'Development Status :: 5 - Production/Stable',
			'Intended Audience :: Science/Research',
			'License :: OSI Approved :: BSD License',
			'Natural Language :: English',
			'Programming Language :: Python :: 2',
			'Programming Language :: Python :: 3',
			'Topic :: Scientific/Engineering :: Artificial Intelligence',
			'Topic :: Utilities',
		],
)
