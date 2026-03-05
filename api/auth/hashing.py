"""
Password hashing using bcrypt directly.

We use the `bcrypt` library directly rather than routing through passlib
because passlib <=1.7.4 is not compatible with bcrypt >=4.x (the __about__
attribute was removed and the hashpw API changed).
"""
import bcrypt


def hash_password(plain: str) -> str:
    """Return the bcrypt hash of *plain*. Never store plaintext passwords."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(plain.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed*."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
