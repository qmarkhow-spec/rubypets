import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

enum CreatePostKind { text, image, video }

class CreatePostPage extends StatefulWidget {
  const CreatePostPage({super.key});

  @override
  State<CreatePostPage> createState() => _CreatePostPageState();
}

class _CreatePostPageState extends State<CreatePostPage> {
  final _picker = ImagePicker();
  final _contentController = TextEditingController();

  String _visibility = 'public';
  CreatePostKind _kind = CreatePostKind.text;
  XFile? _selectedMedia;
  final Set<String> _taggedPets = {};

  @override
  void dispose() {
    _contentController.dispose();
    super.dispose();
  }

  String _fileName(String path) {
    final normalized = path.replaceAll('\\', '/');
    return normalized.split('/').last;
  }

  Future<void> _pickImage() async {
    final file = await _picker.pickImage(source: ImageSource.gallery);
    if (file == null) return;
    if (!mounted) return;
    setState(() => _selectedMedia = file);
  }

  Future<void> _pickVideo() async {
    final file = await _picker.pickVideo(
      source: ImageSource.gallery,
      maxDuration: const Duration(minutes: 1),
    );
    if (file == null) return;
    if (!mounted) return;
    setState(() => _selectedMedia = file);
  }

  void _clearMedia() {
    setState(() {
      _selectedMedia = null;
    });
  }

  void _setKind(CreatePostKind next) {
    if (next == _kind) return;
    setState(() {
      _kind = next;
      _selectedMedia = null;
      if (_kind == CreatePostKind.text) {
        _taggedPets.clear();
      }
    });
  }

  void _submit() {
    final content = _contentController.text.trim();
    if (_kind == CreatePostKind.text) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('送出純文字貼文（字數：${content.length}）待串接')),
      );
      return;
    }

    if (_selectedMedia == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_kind == CreatePostKind.video ? '請先選擇影片' : '請先選擇圖片')),
      );
      return;
    }

    if (_taggedPets.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('請先標記至少一隻寵物')),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '送出${_kind == CreatePostKind.video ? '影片' : '圖文'}貼文：${_fileName(_selectedMedia!.path)}（tag: ${_taggedPets.join(', ')}）待串接',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('新增貼文'),
        actions: [
          TextButton(
            onPressed: _submit,
            child: const Text('送出'),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SegmentedButton<CreatePostKind>(
              segments: const [
                ButtonSegment(value: CreatePostKind.text, label: Text('貼文')),
                ButtonSegment(value: CreatePostKind.image, label: Text('圖文')),
                ButtonSegment(value: CreatePostKind.video, label: Text('影片')),
              ],
              selected: <CreatePostKind>{_kind},
              onSelectionChanged: (selection) => _setKind(selection.first),
            ),
            TextField(
              controller: _contentController,
              decoration: const InputDecoration(
                hintText: '分享你與寵物的日常...',
              ),
              minLines: 4,
              maxLines: 8,
            ),
            const SizedBox(height: 12),
            if (_kind != CreatePostKind.text) ...[
              Row(
                children: [
                  IconButton(
                    tooltip: _kind == CreatePostKind.video ? '選擇影片（1 分鐘內）' : '選擇圖片',
                    onPressed: _kind == CreatePostKind.video ? _pickVideo : _pickImage,
                    icon: Icon(
                      _kind == CreatePostKind.video
                          ? Icons.video_library_outlined
                          : Icons.photo_library_outlined,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      _selectedMedia == null
                          ? (_kind == CreatePostKind.video
                              ? '新增影片（限 1 段，1 分鐘內）'
                              : '新增圖片（限 1 張）')
                          : '${_kind == CreatePostKind.video ? '影片' : '圖片'}：${_fileName(_selectedMedia!.path)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (_selectedMedia != null)
                    IconButton(
                      tooltip: '移除媒體',
                      onPressed: _clearMedia,
                      icon: const Icon(Icons.close),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '標記寵物（至少 1 個）',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _mockPets
                    .map(
                      (pet) => FilterChip(
                        label: Text(pet),
                        selected: _taggedPets.contains(pet),
                        onSelected: (selected) {
                          setState(() {
                            if (selected) {
                              _taggedPets.add(pet);
                            } else {
                              _taggedPets.remove(pet);
                            }
                          });
                        },
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 12),
            ],
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

const _mockPets = <String>['Mochi', 'Kiki', 'Luna'];
