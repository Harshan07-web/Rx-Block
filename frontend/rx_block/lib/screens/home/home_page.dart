import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/user_provider.dart';
import '../scanner/scanner_page.dart';
import '../profile/profile_page.dart';
import '../history/history_page.dart';
import '../auth/login_page.dart';

class HomePage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {

    final user = Provider.of<UserProvider>(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(user.role),
        actions: [
          IconButton(
            icon: Icon(Icons.person),
            onPressed: () {
              Navigator.push(context,
                  MaterialPageRoute(builder: (_) => ProfilePage()));
            },
          )
        ],
      ),

      drawer: Drawer(
        child: ListView(
          children: [
            DrawerHeader(child: Text(user.email)),

            ListTile(
              title: Text("History"),
              onTap: () {
                Navigator.push(context,
                    MaterialPageRoute(builder: (_) => HistoryPage()));
              },
            ),

            ListTile(
              title: Text("Logout"),
              onTap: () {
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(builder: (_) => LoginPage()),
                      (route) => false,
                );
              },
            ),
          ],
        ),
      ),

      body: Center(
        child: Text(
          user.role == "Customer"
              ? "Scan to Verify"
              : user.role == "Distributor"
              ? "Accept Shipment"
              : user.role == "Pharmacy"
              ? "Receive & Sell"
              : "Admin Panel",
          style: TextStyle(fontSize: 22),
        ),
      ),

      floatingActionButton: user.role != "Admin"
          ? FloatingActionButton(
        child: Icon(Icons.qr_code),
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => ScannerPage()),
          );
        },
      )
          : null,
    );
  }
}