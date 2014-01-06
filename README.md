Rigor-related web apps
======================

This repo contains two web apps.  Both use Flask on the server to provide JSON data to an AngularJS app in the browser.

Important files:

    backend.py  # Handles database queries
    browse_app.py  # Flask app connecting URLs to the backend
    crowd_app.py  # Flask app connecting URLs to the backend
    static/js/*.js  # AngularJS code for the client side
    templates/*.html # AngularJS templates for the client side

Rigor database browser
----------------------

To run:

    ./browse_app.py PORTNUMBER

Lets the user browse the database of images and view their tags and annotations.

Crowdsourced data input
-----------------------

To run:

    ./crowd_app.py PORTNUMBER

Allows a crowd of people to adjust the bounding boxes of words and characters.

Dependencies
------------

See requirements.txt for a complete list

* Flask
* ImageMagick
