from flask import Flask, render_template, send_from_directory

app = Flask(__name__, template_folder='website')

@app.route('/')
def index():
    return render_template("homepage/index.html")

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory("website", filename)

@app.errorhandler(404)
def page_not_found(_error):
    return render_template("404/404.html"), 404

if __name__ == '__main__':
    from waitress import serve
    serve(app, host="0.0.0.0", port=6060)