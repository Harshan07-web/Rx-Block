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

class _ScannerPageState extends State<ScannerPage>
    with TickerProviderStateMixin {

  bool scanned = false;
  bool isLoading = false;
  bool isError = false;

  late AnimationController scanController;
  late AnimationController glowController;

  late Animation<double> scanLine;
  late Animation<double> glowAnimation;

  @override
  void initState() {
    super.initState();

    // 🔥 Laser movement
    scanController = AnimationController(
      vsync: this,
      duration: Duration(seconds: 2),
    )..repeat(reverse: true);

    scanLine = Tween<double>(begin: -140, end: 140).animate(scanController);

    // 🔥 Glow pulse
    glowController = AnimationController(
      vsync: this,
      duration: Duration(seconds: 1),
    )..repeat(reverse: true);

    glowAnimation = Tween<double>(begin: 0.3, end: 1).animate(glowController);
  }

  Future<void> handleScan(String code) async {
    if (scanned) return;

    setState(() {
      scanned = true;
      isLoading = true;
      isError = false;
    });

    try {
      final user = Provider.of<UserProvider>(context, listen: false);
      user.addScan();

      final data = await ApiService.scan(code);

      setState(() {
        isLoading = false;
      });

      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ResultPage(data: data),
        ),
      );

    } catch (e) {
      setState(() {
        isLoading = false;
        isError = true;
      });
    }
  }

  void retry() {
    setState(() {
      scanned = false;
      isError = false;
    });
  }

  @override
  void dispose() {
    scanController.dispose();
    glowController.dispose();
    super.dispose();
  }

  Color getColor() {
    if (isError) return Colors.redAccent;
    if (isLoading) return Colors.orangeAccent;
    return Colors.cyanAccent;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Color(0xFF050A18),
      appBar: AppBar(
        title: Text("Scan QR"),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),

      body: Stack(
        children: [

          /// 📷 CAMERA
          MobileScanner(
            onDetect: (barcodeCapture) {
              final code = barcodeCapture.barcodes.first.rawValue;
              if (code != null) handleScan(code);
            },
          ),

          /// 🔮 GLASS OVERLAY
          Container(
            color: Colors.black.withOpacity(0.6),
          ),

          /// 🔥 SCANNER UI
          Center(
            child: AnimatedBuilder(
              animation: glowAnimation,
              builder: (_, __) {
                return Container(
                  width: 300,
                  height: 300,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(25),
                    boxShadow: [
                      BoxShadow(
                        color: getColor().withOpacity(glowAnimation.value),
                        blurRadius: 25,
                        spreadRadius: 3,
                      )
                    ],
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [

                      /// 🔲 MAIN BOX
                      Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(25),
                          border: Border.all(
                            color: getColor(),
                            width: 2,
                          ),
                        ),
                      ),

                      /// 🔥 CORNER EDGES (PRO LOOK)
                      ..._buildCorners(getColor()),

                      /// 🔥 LASER LINE
                      if (!scanned)
                        AnimatedBuilder(
                          animation: scanLine,
                          builder: (_, __) {
                            return Transform.translate(
                              offset: Offset(0, scanLine.value),
                              child: Container(
                                width: 240,
                                height: 3,
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: [
                                      Colors.transparent,
                                      getColor(),
                                      Colors.transparent,
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),

                      /// ⏳ LOADING
                      if (isLoading)
                        CircularProgressIndicator(color: Colors.orangeAccent),

                      /// ❌ ERROR
                      if (isError)
                        Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.error,
                                color: Colors.redAccent, size: 60),
                            SizedBox(height: 10),
                            Text(
                              "Scan Failed\nTry Again",
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Colors.redAccent,
                                fontSize: 16,
                              ),
                            ),
                            SizedBox(height: 10),
                            ElevatedButton(
                              onPressed: retry,
                              child: Text("Retry"),
                            )
                          ],
                        ),
                    ],
                  ),
                );
              },
            ),
          ),

          /// 🔻 BOTTOM TEXT
          Positioned(
            bottom: 50,
            left: 0,
            right: 0,
            child: Center(
              child: Text(
                isError
                    ? "Invalid QR Code"
                    : isLoading
                        ? "Verifying on Blockchain..."
                        : "Align QR within frame",
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 16,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 🔥 CORNER DESIGN
  List<Widget> _buildCorners(Color color) {
    double size = 40;
    double thickness = 4;

    return [
      Positioned(
        top: 0,
        left: 0,
        child: _corner(color, size, thickness, true, true),
      ),
      Positioned(
        top: 0,
        right: 0,
        child: _corner(color, size, thickness, false, true),
      ),
      Positioned(
        bottom: 0,
        left: 0,
        child: _corner(color, size, thickness, true, false),
      ),
      Positioned(
        bottom: 0,
        right: 0,
        child: _corner(color, size, thickness, false, false),
      ),
    ];
  }

  Widget _corner(Color color, double size, double thickness,
      bool left, bool top) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        border: Border(
          left: left
              ? BorderSide(color: color, width: thickness)
              : BorderSide.none,
          right: !left
              ? BorderSide(color: color, width: thickness)
              : BorderSide.none,
          top: top
              ? BorderSide(color: color, width: thickness)
              : BorderSide.none,
          bottom: !top
              ? BorderSide(color: color, width: thickness)
              : BorderSide.none,
        ),
      ),
    );
  }
}