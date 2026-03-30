import 'package:flutter/material.dart';

class ResultPage extends StatelessWidget {
  final Map data;

  ResultPage({required this.data});

  @override
  Widget build(BuildContext context) {
    bool valid = data["status"] == "valid";

    return Scaffold(
      backgroundColor: Color(0xFFF5F6FA),
      appBar: AppBar(
        title: Text("Drug Verification"),
        backgroundColor: Colors.white,
        elevation: 1,
        foregroundColor: Colors.black,
      ),
      body: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [

            /// ✅ STATUS CARD
            Container(
              width: double.infinity,
              padding: EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: valid ? Color(0xFFE8F5E9) : Color(0xFFFFEBEE),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: valid ? Colors.green : Colors.red,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    valid ? Icons.check_circle : Icons.error,
                    color: valid ? Colors.green : Colors.red,
                  ),
                  SizedBox(width: 10),
                  Text(
                    valid ? "GENUINE DRUG" : "FAKE DRUG",
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: valid ? Colors.green : Colors.red,
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
            ),

            SizedBox(height: 20),

            /// 💊 DRUG NAME
            Text(
              data["drug_name"] ?? "-",
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.black,
              ),
            ),

            SizedBox(height: 15),

            /// 📦 DETAILS SECTION
            Text(
              "Details",
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 16,
                color: Colors.black87,
              ),
            ),

            SizedBox(height: 10),

            Container(
              padding: EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: Column(
                children: [
                  buildRow("Batch ID", data["batch_id"]),
                  buildRow("Manufacturer", data["manufacturer"]),
                  buildRow("Manufacturing Date", data["manufacturing_date"]),
                  buildRow("Expiry Date", data["expiry_date"]),
                ],
              ),
            ),

            SizedBox(height: 20),

            /// 🔗 SUPPLY CHAIN
            Text(
              "Supply Chain",
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 16,
                color: Colors.black87,
              ),
            ),

            SizedBox(height: 10),

            Expanded(
              child: Container(
                padding: EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: ListView.builder(
                  itemCount: data["chain"].length,
                  itemBuilder: (context, index) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        children: [
                          Icon(Icons.circle, size: 8, color: Colors.grey),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              data["chain"][index],
                              style: TextStyle(color: Colors.black87),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),

            SizedBox(height: 15),

            /// 🔁 BUTTON
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.black,
                  padding: EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: () {
                  Navigator.pop(context);
                },
                child: Text(
                  "Scan Again",
                  style: TextStyle(color: Colors.white),
                ),
              ),
            )
          ],
        ),
      ),
    );
  }

  Widget buildRow(String title, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: TextStyle(color: Colors.grey[600])),
          Text(
            value ?? "-",
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: Colors.black,
            ),
          ),
        ],
      ),
    );
  }
}