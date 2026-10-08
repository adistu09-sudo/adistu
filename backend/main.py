from werkzeug.wrappers import Response

if __package__:
    from .app import app
else:
    from app import app


def api(request):
    return Response.from_app(app, request.environ)
