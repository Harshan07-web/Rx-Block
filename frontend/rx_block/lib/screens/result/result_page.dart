import 'package:flutter/material.dart';

class ResultPage extends StatefulWidget {
  final Map data;
  ResultPage({required this.data});

  @override
  _ResultPageState createState() => _ResultPageState();
}

class _ResultPageState extends State<ResultPage>
    with SingleTickerProviderStateMixin {

  late AnimationController _controller;
  late Animation<double> scaleAnim;
  late Animation<double> glowAnim;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: 800),
    );

    scaleAnim = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.elasticOut),
    );

    glowAnim = Tween<double>(begin: 0.2, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeIn),
    );

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {

    bool valid = widget.data["status"] == "valid";

    Color mainColor = valid ? Colors.greenAccent : Colors.redAccent;

    return Scaffold(
      backgroundColor: Color(0xFF050A18),
      appBar: AppBar(
        title: Text("Verification Result"),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),

      body: Center(
        child: AnimatedBuilder(
          animation: _controller,
          builder: (_, __) {
            return Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [

                /// 🔥 Animated Icon with Glow
                Transform.scale(
                  scale: scaleAnim.value,
                  child: Container(
                    padding: EdgeInsets.all(25),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: mainColor.withOpacity(glowAnim.value),
                          blurRadius: 40,
                          spreadRadius: 5,
                        )
                      ],
                    ),
                    child: Icon(
                      valid ? Icons.verified : Icons.cancel,
                      size: 90,
                      color: mainColor,
                    ),
                  ),
                ),

                SizedBox(height: 25),

                /// 🔥 Main Text
                AnimatedSwitcher(
                  duration: Duration(milliseconds: 500),
                  child: Text(
                    valid ? "GENUINE DRUG" : "FAKE DRUG",
                    key: ValueKey(valid),
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                      color: mainColor,
                      letterSpacing: 1.5,
                    ),
                  ),
                ),

                SizedBox(height: 10),

                /// 🔥 Subtitle
                Text(
                  valid
                      ? "Verified on Blockchain"
                      : "This product may be counterfeit",
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 16,
                  ),
                ),

                SizedBox(height: 30),

                /// 📦 DETAILS CARD
                Container(
                  margin: EdgeInsets.symmetric(horizontal: 20),
                  padding: EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [

                      /// Batch ID
                      Text(
                        "Batch ID",
                        style: TextStyle(
                          color: Colors.white54,
                          fontSize: 14,
                        ),
                      ),
                      SizedBox(height: 5),
                      Text(
                        widget.data["batchId"] ?? "N/A",
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                        ),
                      ),

                      SizedBox(height: 20),

                      /// Supply Chain
                      Text(
                        "Supply Chain",
                        style: TextStyle(
                          color: Colors.white54,
                          fontSize: 14,
                        ),
                      ),
                      SizedBox(height: 10),

                      Column(
                        children: (widget.data["chain"] ?? [])
                            .map<Widget>((e) => Row(
                                  children: [
                                    Icon(Icons.circle,
                                        size: 8, color: mainColor),
                                    SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        e,
                                        style: TextStyle(
                                          color: Colors.white70,
                                        ),
                                      ),
                                    ),
                                  ],
                                ))
                            .toList(),
                      ),
                    ],
                  ),
                ),

                SizedBox(height: 30),

                /// 🔙 BACK BUTTON
                ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: mainColor,
                    padding:
                        EdgeInsets.symmetric(horizontal: 30, vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(30),
                    ),
                  ),
                  child: Text("Scan Again"),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}