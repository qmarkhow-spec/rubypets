import 'package:flutter/material.dart';

class CreatePostPage extends StatefulWidget {
  const CreatePostPage({super.key});

  @override
  State<CreatePostPage> createState() => _CreatePostPageState();
}

class _CreatePostPageState extends State<CreatePostPage> {
  final _contentController = TextEditingController();
  bool _hasMedia = false;
  String _visibility = 'public';

  @override
  void dispose() {
    _contentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('新增貼文'),
        actions: [
          TextButton(
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('貼文送出流程待串接')),
              );
            },
            child: const Text('送出'),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _contentController,
              decoration: const InputDecoration(
                hintText: '分享你與寵物的日常...',
                border: OutlineInputBorder(),
              ),
              minLines: 4,
              maxLines: 8,
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              title: const Text('附上媒體'),
              subtitle: const Text('預留媒體挑選流程'),
              value: _hasMedia,
              onChanged: (value) => setState(() => _hasMedia = value),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _visibility,
              decoration: const InputDecoration(labelText: '可見性'),
              items: const [
                DropdownMenuItem(value: 'public', child: Text('公開')),
                DropdownMenuItem(value: 'friends', child: Text('好友')),
                DropdownMenuItem(value: 'private', child: Text('僅自己')),
              ],
              onChanged: (value) {
                if (value != null) setState(() => _visibility = value);
              },
            ),
          ],
        ),
      ),
    );
  }
}
