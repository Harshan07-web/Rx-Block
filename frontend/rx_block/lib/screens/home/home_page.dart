import 'dart:ui';
import 'package:flutter/material.dart';
import '../profile/profile_page.dart';
import '../history/history_page.dart';
import '../scanner/scanner_page.dart';
import '../auth/login_page.dart';

class HomePage extends StatefulWidget {
  @override
  _HomePageState createState() => _HomePageState();
}

class _HomePageState extends State<HomePage>
    with TickerProviderStateMixin {

  late AnimationController glowController;
  late AnimationController textController;

  @override
  void initState() {
    super.initState();

    glowController =
        AnimationController(vsync: this, duration: Duration(seconds: 2))
          ..repeat(reverse: true);

    textController =
        AnimationController(vsync: this, duration: Duration(seconds: 2))
          ..forward();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Color(0xFF070B1F),
      drawer: _buildDrawer(),

      body: Stack(
        children: [

          /// 🌌 BACKGROUND GRADIENT
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Color(0xFF070B1F),
                  Color(0xFF0F1A3C),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
          ),

          /// ☰ MENU BUTTON
          Positioned(
            top: 40,
            left: 20,
            child: Builder(
              builder: (context) => _glassButton(Icons.menu, () {
                Scaffold.of(context).openDrawer();
              }),
            ),
          ),

          /// 🔥 CENTER CONTENT
          Center(
            child: FadeTransition(
              opacity: textController,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [

                  /// RX-BLOCK TEXT
                  ShaderMask(
                    shaderCallback: (bounds) => LinearGradient(
                      colors: [Colors.blue, Colors.purple],
                    ).createShader(bounds),
                    child: Text(
                      "RX-BLOCK",
                      style: TextStyle(
                        fontSize: 38,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        letterSpacing: 2,
                      ),
                    ),
                  ),

                  SizedBox(height: 25),

                  /// TAGLINE
                  Text(
                    "TRUST IN EVERY DOSE",
                    style: TextStyle(
                      color: Colors.white70,
                      letterSpacing: 3,
                    ),
                  ),
                ],
              ),
            ),
          ),

          /// 🔥 SCANNER BUTTON (NEON ANIMATION)
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 50),
              child: AnimatedBuilder(
                animation: glowController,
                builder: (_, child) {
                  return Container(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.blueAccent
                              .withOpacity(0.6 * glowController.value),
                          blurRadius: 30,
                          spreadRadius: 5,
                        )
                      ],
                    ),
                    child: GestureDetector(
                      onTap: () {
                        Navigator.push(context,
                            MaterialPageRoute(builder: (_) => ScannerPage()));
                      },
                      child: CircleAvatar(
                        radius: 38,
                        backgroundColor: Colors.blueAccent,
                        child: Icon(Icons.qr_code_scanner,
                            size: 30, color: Colors.white),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),

          /// 👤 PROFILE BUTTON
          Positioned(
            bottom: 30,
            right: 20,
            child: _glassButton(Icons.person, () {
              Navigator.push(context,
                  MaterialPageRoute(builder: (_) => ProfilePage()));
            }),
          ),

          /// ⚙ SETTINGS BUTTON
          Positioned(
            bottom: 30,
            left: 20,
            child: _glassButton(Icons.settings, () {
              _showSettings();
            }),
          ),
        ],
      ),
    );
  }

  /// 🌟 GLASS BUTTON
  Widget _glassButton(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(15),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            padding: EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: Colors.white24),
            ),
            child: Icon(icon, color: Colors.white),
          ),
        ),
      ),
    );
  }

  /// 📂 DRAWER MENU
  Widget _buildDrawer() {
    return Drawer(
      child: Container(
        color: Color(0xFF070B1F),
        child: ListView(
          children: [
            DrawerHeader(
              child: Text(
                "RX-BLOCK",
                style: TextStyle(color: Colors.white, fontSize: 22),
              ),
            ),

            /// HISTORY
            ListTile(
              leading: Icon(Icons.history, color: Colors.white),
              title: Text("History", style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.push(context,
                    MaterialPageRoute(builder: (_) => HistoryPage()));
              },
            ),

            /// LOGOUT
            ListTile(
              leading: Icon(Icons.logout, color: Colors.red),
              title: Text("Logout", style: TextStyle(color: Colors.red)),
              onTap: () {
                Navigator.pushReplacement(context,
                    MaterialPageRoute(builder: (_) => LoginPage()));
              },
            ),
          ],
        ),
      ),
    );
  }

  /// ⚙ SETTINGS MODAL
  void _showSettings() {
    showModalBottomSheet(
        context: context,
        backgroundColor: Colors.transparent,
        builder: (_) {
          return Container(
            decoration: BoxDecoration(
              color: Color(0xFF0F1A3C),
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: ListTile(
              title: Text("Logout", style: TextStyle(color: Colors.red)),
              onTap: () {
                Navigator.pushReplacement(context,
                    MaterialPageRoute(builder: (_) => LoginPage()));
              },
            ),
          );
        });
  }
}