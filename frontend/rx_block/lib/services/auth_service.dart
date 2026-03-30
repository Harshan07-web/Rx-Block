class AuthService {
  static Map<String, String> users = {};

  static bool register(String email, String password) {
    if (users.containsKey(email)) return false;
    users[email] = password;
    return true;
  }

  static bool login(String email, String password) {
    return users[email] == password;
  }
}