import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/user_provider.dart';

class HistoryPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {

    final user = Provider.of<UserProvider>(context);

    return Scaffold(
      appBar: AppBar(title: Text("History")),
      body: Center(
        child: Text("Total Scans: ${user.scans}"),
      ),
    );
  }
}