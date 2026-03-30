import 'package:flutter/material.dart';

class UserProvider extends ChangeNotifier {
  String email = "";
  String role = "Customer";
  int scans = 0;

  void setUser(String e, String r) {
    email = e;
    role = r;
    notifyListeners();
  }

  void addScan() {
    scans++;
    notifyListeners();
  }
}