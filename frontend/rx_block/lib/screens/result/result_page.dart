import 'package:flutter/material.dart';

class ResultPage extends StatelessWidget {

  final Map data;
  ResultPage({required this.data});

  @override
  Widget build(BuildContext context) {

    bool valid = data["status"] == "valid";

    return Scaffold(
      appBar: AppBar(title: Text("Result")),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [

            Icon(
              valid ? Icons.check_circle : Icons.error,
              size: 100,
              color: valid ? Colors.green : Colors.red,
            ),

            Text(valid ? "Genuine Drug" : "Fake Drug"),

            Text("Batch: ${data["batchId"]}"),

            ...data["chain"].map<Widget>((e) => Text(e)).toList()
          ],
        ),
      ),
    );
  }
}