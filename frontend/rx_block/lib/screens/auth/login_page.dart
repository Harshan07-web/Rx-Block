import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/user_provider.dart';
import '../home/home_page.dart';

class LoginPage extends StatefulWidget {
  @override
  _LoginPageState createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {

  final email = TextEditingController();
  final password = TextEditingController();
  String role = "Customer";

  @override
  Widget build(BuildContext context) {

    return Scaffold(
      body: Padding(
        padding: EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [

            Text("Login", style: TextStyle(fontSize: 28)),

            TextField(controller: email, decoration: InputDecoration(labelText: "Email")),
            TextField(controller: password, decoration: InputDecoration(labelText: "Password")),

            DropdownButton<String>(
              value: role,
              items: ["Customer","Distributor","Pharmacy","Admin"]
                  .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                  .toList(),
              onChanged: (val) => setState(() => role = val!),
            ),

            ElevatedButton(
              onPressed: () {
                Provider.of<UserProvider>(context, listen: false)
                    .setUser(email.text, role);

                Navigator.pushReplacement(
                  context,
                  MaterialPageRoute(builder: (_) => HomePage()),
                );
              },
              child: Text("Login"),
            )
          ],
        ),
      ),
    );
  }
}