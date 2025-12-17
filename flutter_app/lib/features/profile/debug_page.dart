import 'package:flutter/material.dart';

class DebugPage extends StatefulWidget {
  const DebugPage({super.key});

  @override
  State<DebugPage> createState() => _DebugPageState();
}

class _DebugPageState extends State<DebugPage> {
  bool _mockNetwork = true;
  bool _enableLogs = true;
  String _environment = 'dev';

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Debug 工具 (暫放於個人區)',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 12),
        SwitchListTile(
          title: const Text('啟用假資料'),
          subtitle: const Text('暫時用 mock feed 來源'),
          value: _mockNetwork,
          onChanged: (value) => setState(() => _mockNetwork = value),
        ),
        SwitchListTile(
          title: const Text('啟用日誌'),
          subtitle: const Text('顯示 console log'),
          value: _enableLogs,
          onChanged: (value) => setState(() => _enableLogs = value),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          decoration: const InputDecoration(labelText: '環境'),
          initialValue: _environment,
          items: const [
            DropdownMenuItem(value: 'dev', child: Text('Dev')),
            DropdownMenuItem(value: 'staging', child: Text('Staging')),
            DropdownMenuItem(value: 'prod', child: Text('Prod')),
          ],
          onChanged: (value) {
            if (value != null) setState(() => _environment = value);
          },
        ),
        const SizedBox(height: 16),
        ElevatedButton.icon(
          onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  'Debug 模式更新：mock=$_mockNetwork, logs=$_enableLogs, env=$_environment',
                ),
              ),
            );
          },
          icon: const Icon(Icons.save_outlined),
          label: const Text('套用設定'),
        ),
      ],
    );
  }
}
