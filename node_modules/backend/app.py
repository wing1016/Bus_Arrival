from flask import Flask

app = Flask(__name__)

@app.route('/')
def home():
    return "Hello from Flask backend!"

@app.route('/api/hello')
def hello_api():
    return {"message": "Hello from Flask API!"}

if __name__ == '__main__':
    app.run(port=5000, debug=True)