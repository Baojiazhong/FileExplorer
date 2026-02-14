//! ART (Adaptive Radix Trie) 使用示例
//!
//! 本示例演示了如何使用 ART 数据结构进行高效的前缀搜索。
//! ART 是一个自适应基数树，通过动态调整节点大小来优化内存使用。
//!
//! 运行方式:
//! ```bash
//! cargo run --example art_usage_example
//! ```

use file_explorer::search_engine::art_v5::ART;
use std::time::Instant;

fn main() {
    println!("=== ART (Adaptive Radix Trie) 使用示例 ===\n");

    // 示例 1: 基础操作
    basic_operations_example();

    // 示例 2: 前缀搜索演示
    prefix_search_example();

    // 示例 3: 批量操作性能测试
    batch_operations_example();

    // 示例 4: 节点增长演示（带详细节点信息）
    node_growth_example();

    // 示例 5: 实际应用场景 - 文件搜索
    file_search_scenario_example();
}

/// 示例 1: 基础 CRUD 操作
fn basic_operations_example() {
    println!("\n【示例 1】基础操作");
    println!("-------------------");

    // 创建 ART 实例，设置最大结果数为 100
    let mut trie = ART::new(100);

    // 插入文件路径
    println!("1. 插入路径:");
    let paths = vec![
        ("/home/user/documents/report.pdf", 1.0),
        ("/home/user/documents/notes.txt", 0.9),
        ("/home/user/pictures/vacation.jpg", 0.8),
        ("/home/user/pictures/profile.png", 0.85),
        ("/home/other/projects/code.rs", 0.7),
    ];

    for (path, score) in &paths {
        trie.insert(path, *score);
        println!("   ✓ 插入: {} (score: {})", path, score);
    }

    println!("\n2. 当前索引路径数: {}", trie.len());

    // 前缀搜索
    println!("\n3. 搜索 '/home/user/doc':");
    let results = trie.find_completions("/home/user/doc");
    for (path, score) in &results {
        println!("   → {} (score: {:.1})", path, score);
    }

    // 删除操作
    println!("\n4. 删除 '/home/user/pictures/vacation.jpg'");
    let removed = trie.remove("/home/user/pictures/vacation.jpg");
    println!("   ✓ 删除成功: {}", removed);

    // 验证删除
    println!("\n5. 删除后搜索 '/home/user/pictures':");
    let results = trie.find_completions("/home/user/pictures");
    for (path, score) in &results {
        println!("   → {} (score: {:.1})", path, score);
    }

    // 清空
    trie.clear();
    println!("\n6. 清空后路径数: {}", trie.len());
}

/// 示例 2: 前缀搜索的不同场景
fn prefix_search_example() {
    println!("\n\n【示例 2】前缀搜索演示");
    println!("-----------------------");

    let mut trie = ART::new(50);

    // 准备具有共同前缀的路径
    let paths = vec![
        "/usr/local/bin/python3",
        "/usr/local/bin/pip3",
        "/usr/local/lib/python3.9/site-packages/numpy",
        "/usr/local/lib/python3.9/site-packages/pandas",
        "/usr/share/doc/python3",
        "/home/user/projects/rust/src/main.rs",
        "/home/user/projects/rust/Cargo.toml",
        "/home/user/projects/go/main.go",
        "/var/log/syslog",
        "/var/log/nginx/access.log",
    ];

    println!("索引路径:");
    for path in &paths {
        trie.insert(path, 1.0);
        println!("  {}", path);
    }

    // 测试不同长度的前缀
    let test_prefixes = vec![
        "/usr",
        "/usr/local",
        "/usr/local/bin",
        "/home/user/projects",
        "/var/log",
        "/nonexistent",
    ];

    println!("\n前缀搜索结果:");
    for prefix in &test_prefixes {
        let results = trie.find_completions(prefix);
        println!("\n  搜索 '{}': 找到 {} 个结果", prefix, results.len());
        for (path, score) in results.iter().take(5) {
            println!("    → {}", path);
        }
        if results.len() > 5 {
            println!("    ... 还有 {} 个结果", results.len() - 5);
        }
    }
}

/// 示例 3: 批量操作和性能测试
fn batch_operations_example() {
    println!("\n\n【示例 3】批量操作性能测试");
    println!("----------------------------");

    let mut trie = ART::new(1000);

    // 生成测试路径
    let test_paths: Vec<String> = (0..1000)
        .map(|i| {
            format!(
                "/home/user/documents/project{}/subdir{}/file{}.txt",
                i % 100,
                i % 10,
                i
            )
        })
        .collect();

    // 批量插入计时
    let start = Instant::now();
    for (i, path) in test_paths.iter().enumerate() {
        let score = 1.0 - (i as f32 * 0.0001);
        trie.insert(path, score);
    }
    let insert_time = start.elapsed();

    println!("批量插入统计:");
    println!("  插入路径数: {}", test_paths.len());
    println!("  唯一路径数: {}", trie.len());
    println!("  插入耗时: {:?}", insert_time);
    println!(
        "  平均速度: {:.2} paths/ms",
        test_paths.len() as f64 / insert_time.as_millis().max(1) as f64
    );

    // 搜索性能测试
    let search_prefixes = vec![
        "/home/user/documents/project1",
        "/home/user/documents/project50",
        "/home/user/documents/project99",
    ];

    println!("\n搜索性能测试:");
    for prefix in &search_prefixes {
        let start = Instant::now();
        let results = trie.find_completions(prefix);
        let search_time = start.elapsed();

        println!("  搜索 '{}':", prefix);
        println!("    找到 {} 个结果", results.len());
        println!("    耗时: {:?}", search_time);
    }
}

/// 示例 4: 节点自动增长演示（带详细节点信息）
fn node_growth_example() {
    println!("\n\n【示例 4】节点自动增长演示");
    println!("----------------------------");
    println!("此示例展示 ART 如何根据子节点数量自动调整节点类型\n");

    let mut trie = ART::new(100);
    let base_prefix = "/common/path/file_";

    // 关键点：节点类型增长取决于"同一个节点"下有多少个不同的子 key。
    // 仅用数字后缀(0-9)时，最多只有10个分叉，永远触发不了 Node16->Node48。
    // 这里使用 60 个不同的 ASCII 字符作为第一个分叉字节，确保能触发:
    // Node4 -> Node16 -> Node48 -> Node256。
    let all_keys: Vec<char> = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
        .chars()
        .take(60)
        .collect();

    let make_path = |k: char| -> String { format!("{}{}", base_prefix, k) };

    // ========== 阶段 1: Node4 (0-4 子节点) ==========
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("阶段 1: 插入 3 个路径（使用 Node4 - 最多4个子节点）");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    for &k in &all_keys[0..3] {
        let path = make_path(k);
        trie.insert(&path, 1.0);
        println!("✓ 插入: {}", path);

        println!("\n当前树结构:");
        println!("{}", trie.debug_tree_structure());
    }

    // ========== 阶段 2: Node4 -> Node16 (5-16 子节点) ==========
    println!("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("阶段 2: 继续插入到 10 个路径（Node4 → Node16）");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    for &k in &all_keys[3..10] {
        let path = make_path(k);
        trie.insert(&path, 1.0);
        println!("✓ 插入: {}", path);
    }

    println!("\n当前树结构（注意节点已升级为 Node16）:");
    println!("{}", trie.debug_tree_structure());

    // ========== 阶段 3: Node16 -> Node48 (17-48 子节点) ==========
    println!("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("阶段 3: 继续插入到 25 个路径（Node16 → Node48）");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    for &k in &all_keys[10..25] {
        let path = make_path(k);
        trie.insert(&path, 1.0);

        // 第 17 个不同子 key 插入后，目标节点会从 Node16 增长为 Node48。
        if trie.len() == 17 {
            println!("✓ 插入: {}", path);
            println!("\n达到 17 个路径后（应触发 Node16 → Node48）树结构:");
            println!("{}", trie.debug_tree_structure());
        }
    }

    println!("\n当前树结构（注意节点已升级为 Node48）:");
    println!("{}", trie.debug_tree_structure());

    // ========== 阶段 4: Node48 -> Node256 (49-256 子节点) ==========
    println!("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("阶段 4: 继续插入到 60 个路径（Node48 → Node256）");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    for &k in &all_keys[25..60] {
        let path = make_path(k);
        trie.insert(&path, 1.0);

        // 第 49 个不同子 key 插入后，目标节点会从 Node48 增长为 Node256。
        if trie.len() == 48 || trie.len() == 49 {
            println!("✓ 插入: {}", path);
            println!("\n达到 {} 个路径后树结构:", trie.len());
            println!("{}", trie.debug_tree_structure());
        }
    }

    println!("\n当前树结构（注意节点已升级为 Node256）:");
    println!("{}", trie.debug_tree_structure());

    // ========== 验证搜索结果 ==========
    println!("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("验证: 搜索所有路径");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    let results = trie.find_completions("/common/path");
    println!("\n搜索 '/common/path': 找到 {} 个结果", results.len());
    println!("✓ 所有 {} 个路径都可正常访问", results.len());

    // 显示前5个结果
    println!("\n前5个结果:");
    for (i, (path, score)) in results.iter().take(5).enumerate() {
        println!("  {}. {} (score: {:.1})", i + 1, path, score);
    }
}

/// 示例 5: 实际应用场景 - 文件搜索
fn file_search_scenario_example() {
    println!("\n\n【示例 5】实际应用场景 - 文件资源管理器");
    println!("----------------------------------------");

    let mut trie = ART::new(20);

    // 模拟文件系统中的文件
    let files = vec![
        ("/home/alice/Documents/work/report.pdf", 1.0),
        ("/home/alice/Documents/work/budget.xlsx", 0.95),
        ("/home/alice/Documents/personal/photo.jpg", 0.9),
        ("/home/alice/Documents/personal/resume.docx", 0.88),
        ("/home/alice/Downloads/installer.exe", 0.7),
        ("/home/alice/Downloads/manual.pdf", 0.75),
        ("/home/alice/Projects/rust/src/main.rs", 1.0),
        ("/home/alice/Projects/rust/Cargo.toml", 0.9),
        ("/home/alice/Projects/python/app.py", 0.85),
        ("/home/alice/Projects/python/requirements.txt", 0.8),
        ("/home/bob/shared/document.txt", 0.6),
        ("/home/bob/shared/presentation.pptx", 0.65),
    ];

    println!("建立文件索引:");
    for (file, score) in &files {
        trie.insert(file, *score);
        println!("  [{}] {}", score, file);
    }

    // 场景 1: 用户输入部分路径
    println!("\n场景 1: 用户输入 'doc'");
    let query = "doc";
    let results = trie.find_completions(query);
    println!("  自动补全建议:");
    for (path, score) in results {
        println!("    → {} (相关度: {:.0}%)", path, score * 100.0);
    }

    // 场景 2: 在特定目录下搜索
    println!("\n场景 2: 在 '/home/alice/Projects' 下搜索");
    let results = trie.find_completions("/home/alice/Projects");
    println!("  找到的项目文件:");
    for (path, score) in results {
        let filename = path.split('/').last().unwrap_or(path.as_str());
        println!("    → {} (相关度: {:.0}%)", filename, score * 100.0);
    }

    // 场景 3: 查找特定类型的文件
    println!("\n场景 3: 查找 PDF 文件");
    let all_results = trie.find_completions("/");
    let pdf_files: Vec<_> = all_results
        .into_iter()
        .filter(|(path, _)| path.ends_with(".pdf"))
        .collect();

    println!("  找到的 PDF 文件:");
    for (path, score) in pdf_files {
        println!("    → {} (相关度: {:.0}%)", path, score * 100.0);
    }

    // 场景 4: 动态添加新文件并搜索
    println!("\n场景 4: 动态添加新文件");
    let new_file = "/home/alice/Documents/work/plan.pdf";
    println!("  添加新文件: {}", new_file);
    trie.insert(new_file, 0.92);

    let results = trie.find_completions("/home/alice/Documents/work");
    println!("  更新后的工作文档:");
    for (path, score) in results {
        let filename = path.split('/').last().unwrap_or(path.as_str());
        println!("    → {} (相关度: {:.0}%)", filename, score * 100.0);
    }
}
