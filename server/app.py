import os
import secrets
from functools import wraps

import psycopg
from flask import Flask, jsonify, request, session
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from psycopg.rows import dict_row
from werkzeug.security import check_password_hash, generate_password_hash


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", secrets.token_hex(32)),
        DATABASE_URL=os.environ.get("DATABASE_URL", "postgresql:///personal_finance"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("FLASK_ENV") == "production",
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
    )
    if test_config:
        app.config.update(test_config)

    def connection():
        return psycopg.connect(app.config["DATABASE_URL"], row_factory=dict_row)

    @app.after_request
    def cors(response):
        origin = request.headers.get("Origin")
        allowed = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")
        if origin == allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-CSRF-Token"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS"
            response.headers["Vary"] = "Origin"
        return response

    def csrf_token():
        token = session.get("csrf_token")
        if not token:
            token = secrets.token_urlsafe(32)
            session["csrf_token"] = token
        return token

    def require_csrf(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            supplied = request.headers.get("X-CSRF-Token", "")
            if not supplied or not secrets.compare_digest(supplied, csrf_token()):
                return jsonify(error="Yêu cầu không hợp lệ. Vui lòng tải lại trang."), 403
            return view(*args, **kwargs)
        return wrapped

    def require_user(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if not session.get("user_id"):
                return jsonify(error="Bạn chưa đăng nhập."), 401
            return view(*args, **kwargs)
        return wrapped

    @app.get("/api/health")
    def health():
        with connection() as db:
            db.execute("SELECT 1")
        return jsonify(status="ok")

    @app.get("/api/session")
    def get_session():
        user = None
        if session.get("user_id"):
            with connection() as db:
                user = db.execute(
                    "SELECT full_name AS name, email FROM app_users WHERE id = %s",
                    (session["user_id"],),
                ).fetchone()
        return jsonify(user=user, csrfToken=csrf_token())

    @app.post("/api/auth/register")
    @require_csrf
    def register():
        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))
        if not name or "@" not in email or len(password) < 8:
            return jsonify(error="Họ tên, email và mật khẩu ít nhất 8 ký tự là bắt buộc."), 400
        try:
            with connection() as db:
                user = db.execute(
                    "INSERT INTO app_users (full_name, email, password_hash) VALUES (%s, %s, %s) RETURNING id, full_name AS name, email",
                    (name, email, generate_password_hash(password)),
                ).fetchone()
                db.execute("INSERT INTO user_finance_state (user_id, state) VALUES (%s, '{}'::jsonb)", (user["id"],))
        except psycopg.errors.UniqueViolation:
            return jsonify(error="Email này đã được đăng ký."), 409
        session.clear()
        session["user_id"] = str(user["id"])
        return jsonify(user={"name": user["name"], "email": user["email"]}, csrfToken=csrf_token()), 201

    @app.post("/api/auth/login")
    @require_csrf
    def login():
        payload = request.get_json(silent=True) or {}
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))
        with connection() as db:
            user = db.execute(
                "SELECT id, full_name AS name, email, password_hash FROM app_users WHERE lower(email) = %s",
                (email,),
            ).fetchone()
        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify(error="Email hoặc mật khẩu chưa đúng."), 401
        session.clear()
        session["user_id"] = str(user["id"])
        return jsonify(user={"name": user["name"], "email": user["email"]}, csrfToken=csrf_token())

    @app.post("/api/auth/google")
    @require_csrf
    def google_login():
        client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
        if not client_id or client_id.startswith("your-"):
            return jsonify(error="Đăng nhập Google chưa được cấu hình trên máy chủ."), 503
        credential = str((request.get_json(silent=True) or {}).get("credential", ""))
        if not credential:
            return jsonify(error="Không nhận được thông tin xác thực từ Google."), 400
        try:
            claims = id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)
        except ValueError:
            return jsonify(error="Thông tin xác thực Google không hợp lệ hoặc đã hết hạn."), 401
        email = str(claims.get("email", "")).strip().lower()
        subject = str(claims.get("sub", "")).strip()
        if not email or not subject or claims.get("email_verified") is not True:
            return jsonify(error="Google chưa xác minh địa chỉ email này."), 401
        name = str(claims.get("name") or email.split("@", 1)[0]).strip()[:200]
        try:
            with connection() as db:
                user = db.execute(
                    "SELECT id, full_name AS name, email, google_subject FROM app_users "
                    "WHERE google_subject = %s OR lower(email) = %s ORDER BY google_subject = %s DESC LIMIT 1",
                    (subject, email, subject),
                ).fetchone()
                if user and user.get("google_subject") and user["google_subject"] != subject:
                    return jsonify(error="Email này đã được liên kết với một tài khoản Google khác."), 409
                if user:
                    if not user.get("google_subject"):
                        db.execute("UPDATE app_users SET google_subject = %s WHERE id = %s", (subject, user["id"]))
                else:
                    user = db.execute(
                        "INSERT INTO app_users (full_name, email, google_subject) VALUES (%s, %s, %s) "
                        "RETURNING id, full_name AS name, email, google_subject",
                        (name, email, subject),
                    ).fetchone()
                    db.execute("INSERT INTO user_finance_state (user_id, state) VALUES (%s, '{}'::jsonb)", (user["id"],))
        except psycopg.errors.UniqueViolation:
            return jsonify(error="Không thể liên kết tài khoản Google này."), 409
        session.clear()
        session["user_id"] = str(user["id"])
        return jsonify(user={"name": user["name"], "email": user["email"]}, csrfToken=csrf_token())

    @app.post("/api/auth/logout")
    @require_csrf
    def logout():
        session.clear()
        return jsonify(ok=True)

    @app.get("/api/state")
    @require_user
    def get_state():
        with connection() as db:
            row = db.execute("SELECT state FROM user_finance_state WHERE user_id = %s", (session["user_id"],)).fetchone()
        return jsonify(state=(row or {}).get("state") or {})

    @app.put("/api/state")
    @require_user
    @require_csrf
    def put_state():
        payload = request.get_json(silent=True) or {}
        state = payload.get("state")
        if not isinstance(state, dict):
            return jsonify(error="Dữ liệu đồng bộ không hợp lệ."), 400
        with connection() as db:
            db.execute(
                "INSERT INTO user_finance_state (user_id, state, updated_at) VALUES (%s, %s, now()) "
                "ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()",
                (session["user_id"], psycopg.types.json.Jsonb(state)),
            )
        return jsonify(ok=True)

    @app.errorhandler(psycopg.Error)
    def database_error(_error):
        return jsonify(error="Không thể kết nối cơ sở dữ liệu."), 503

    return app


app = create_app()
