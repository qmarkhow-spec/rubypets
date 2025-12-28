import 'package:flutter/material.dart';

import 'app.dart';
import 'services/session_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SessionController.instance.load();
  runApp(const RubyPetsApp());
}
