import 'package:flutter/material.dart';
import 'core/theme.dart';
import 'screens/splash/splash_screen.dart';
import 'package:provider/provider.dart';
import 'providers/user_provider.dart';

void main() {
  runApp(
    ChangeNotifierProvider(
      create: (_) => UserProvider(),
      child: MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: SplashScreen(),
    );
  }
}