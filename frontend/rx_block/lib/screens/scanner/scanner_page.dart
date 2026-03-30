import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../../providers/user_provider.dart';
import '../../core/api_service.dart';
import '../result/result_page.dart';

class ScannerPage extends StatefulWidget {
  @override
  _ScannerPageState createState() => _ScannerPageState();
}

class _ScannerPageState extends State<ScannerPage> {

  bool scanned = false;

  void handleScan(String code) async {

    if (scanned) return;
    scanned = true;

    final user = Provider.of<UserProvider>(context, listen: false);
    user.addScan();

    final data = await ApiService.scan(code);

    Navigator.push(context,
      MaterialPageRoute(
        builder: (_) => ResultPage(data: data),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("Scan QR")),
      body: MobileScanner(
        onDetect: (barcodeCapture) {
          final code = barcodeCapture.barcodes.first.rawValue;
          if (code != null) handleScan(code);
        },
      ),
    );
  }
}