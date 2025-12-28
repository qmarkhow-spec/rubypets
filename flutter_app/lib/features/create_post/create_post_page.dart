import 'package:flutter/material.dart';

import 'package:rubypets_flutter/services/api_client.dart';
import 'package:rubypets_flutter/services/session_controller.dart';

class CreatePostPage extends StatefulWidget {
  const CreatePostPage({super.key});

  @override
  State<CreatePostPage> createState() => _CreatePostPageState();
}

class _CreatePostPageState extends State<CreatePostPage> {
  final _contentController = TextEditingController();
  final SessionController _session = SessionController.instance;
  String _visibility = 'public';
  bool _submitting = false;

  @override
  void dispose() {
    _contentController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;
    if (!_session.isLoggedIn) {
      _showSnack('Login required');
      return;
    }
    final content = _contentController.text.trim();
    if (content.isEmpty) {
      _showSnack('Content is required');
      return;
    }
    setState(() => _submitting = true);
    try {
      await _session.api.createPost(content: content, visibility: _visibility);
      if (!mounted) return;
      _showSnack('Post created');
      Navigator.of(context).pop();
    } catch (err) {
      if (!mounted) return;
      final message = err is ApiException ? err.message : 'Request failed';
      _showSnack(message);
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create post'),
        actions: [
          TextButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Post'),
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
                hintText: 'Share something about your pet...',
              ),
              minLines: 4,
              maxLines: 8,
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _visibility,
              decoration: const InputDecoration(labelText: 'Visibility'),
              items: const [
                DropdownMenuItem(value: 'public', child: Text('public')),
                DropdownMenuItem(value: 'friends', child: Text('friends')),
                DropdownMenuItem(value: 'private', child: Text('private')),
              ],
              onChanged: (value) {
                if (value != null) {
                  setState(() => _visibility = value);
                }
              },
            ),
            const SizedBox(height: 12),
            Text(
              'Media posts are not supported yet in Flutter.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
