import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/user_provider.dart';

class ProfilePage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {

    final user = Provider.of<UserProvider>(context);

    return Scaffold(
      appBar: AppBar(title: Text("Profile")),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text("Email: ${user.email}"),
            Text("Role: ${user.role}"),
            Text("Scans: ${user.scans}")
          ],
        ),
      ),
    );
  }
}