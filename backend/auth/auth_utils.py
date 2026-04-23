from passlib.context import CryptContext

pass_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hashpass(password: str) -> str:
    return pass_context.hash(password)


def verifypass(plain: str, hashed: str) -> bool:
    return pass_context.verify(plain, hashed)