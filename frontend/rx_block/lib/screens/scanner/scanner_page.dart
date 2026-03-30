import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../../providers/user_provider.dart';
import '../result/result_page.dart';

class ScannerPage extends StatefulWidget {
  @override
  _ScannerPageState createState() => _ScannerPageState();
}

class _ScannerPageState extends State<ScannerPage>
    with SingleTickerProviderStateMixin {

  bool scanned = false;
  bool isLoading = false;
  bool isError = false;

  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();

    /// 🔥 Simple up-down line animation
    _controller = AnimationController(
      vsync: this,
      duration: Duration(seconds: 2),
    )..repeat(reverse: true);

    _animation = Tween<double>(begin: -110, end: 110).animate(_controller);
  }

  Future<void> handleScan(String code) async {
    if (scanned) return;

    setState(() {
      scanned = true;
      isLoading = true;
      isError = false;
    });

    final user = Provider.of<UserProvider>(context, listen: false);
    user.addScan();

    await Future.delayed(Duration(milliseconds: 500));

    try {
      Map data;

      if (code == "RXBLOCK123") {
        data = {
          "status": "valid",
          "batch_id": "B1-001",
          "drug_name": "Amoxicillin 500mg",
          "manufacturer": "BioMeds Inc",
          "manufacturing_date": "2026-03-30",
          "expiry_date": "2028-03-30",
          "chain": [
            "Manufacturer → Distributor",
            "Distributor → Pharmacy"
          ]
        };
      } else {
        data = {
          "status": "fake",
          "batch_id": code,
          "drug_name": "Unknown",
          "manufacturer": "Unknown",
          "manufacturing_date": "-",
          "expiry_date": "-",
          "chain": ["Invalid Source"]
        };
      }

      setState(() => isLoading = false);

      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ResultPage(data: data),
        ),
      );

      setState(() {
        scanned = false;
        isError = false;
      });

    } catch (e) {
      setState(() {
        isLoading = false;
        isError = true;
        scanned = false;
      });
    }
  }

  void retry() {
    setState(() {
      scanned = false;
      isError = false;
      isLoading = false;
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text("Scan QR"),
        backgroundColor: Colors.black,
        elevation: 0,
      ),
      body: Stack(
        children: [

          /// 📷 CAMERA
          MobileScanner(
            onDetect: (barcodeCapture) {
              final code = barcodeCapture.barcodes.first.rawValue;
              if (code != null && !scanned) {
                handleScan(code);
              }
            },
          ),

          /// 🔲 SCAN BOX
          Center(
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white, width: 2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Stack(
                children: [

                  /// 🔥 MOVING LINE (CLEAN)
                  AnimatedBuilder(
                    animation: _animation,
                    builder: (_, __) {
                      return Transform.translate(
                        offset: Offset(0, _animation.value),
                        child: Container(
                          margin: EdgeInsets.symmetric(horizontal: 20),
                          height: 2,
                          color: Colors.white,
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),

          /// ⏳ LOADING
          if (isLoading)
            Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),

          /// ❌ ERROR
          if (isError)
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error, color: Colors.red, size: 60),
                  SizedBox(height: 10),
                  Text(
                    "Scan Failed. Try Again",
                    style: TextStyle(color: Colors.white),
                  ),
                  SizedBox(height: 10),
                  ElevatedButton(
                    onPressed: retry,
                    child: Text("Retry"),
                  )
                ],
              ),
            ),

          /// 🔻 TEXT
          Positioned(
            bottom: 40,
            left: 0,
            right: 0,
            child: Center(
              child: Text(
                isLoading
                    ? "Verifying..."
                    : "Align QR code inside the box",
                style: TextStyle(color: Colors.white70),
              ),
            ),
          ),
        ],
      ),
    );
  }
}