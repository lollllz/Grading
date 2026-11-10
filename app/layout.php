<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#173d32">
<title><?= e($titles[$view] ?? 'Sign in') ?> · Gradebook</title>
<link rel="stylesheet" href="/index.css"><script src="/App.js" defer></script>
</head>
<body class="<?= $view === 'login' ? 'login-page' : '' ?>">
<?php if ($view === 'login'): ?>
<main class="login-layout">
<section class="login-story"><a class="brand" href="/"><span class="brand-mark">g.</span> gradebook<span class="brand-dot">/</span></a>
<div class="story-copy"><span class="eyebrow">A LITTLE CLARITY. A LOT OF PROGRESS.</span><h1>More time to teach.<br>More room to grow.</h1><p>A thoughtful space for your students, their results, and the progress you make together.</p>
<div class="story-rule"></div><div class="story-bottom"><span>Every mark tells a story.</span><span>Make it count.</span></div></div>
<div class="story-art" aria-hidden="true"><div class="art-line"></div><span class="art-num">A</span><span class="art-label">POTENTIAL, IN PROGRESS</span></div>
</section>
<section class="login-panel"><div class="login-form-wrap"><span class="eyebrow">YOUR TEACHING WORKSPACE</span><h2>Welcome back.</h2><p class="muted">Sign in to pick up where you left off.</p>
<?php if ($flash): ?><div class="notice" role="status"><?= e($flash) ?></div><?php endif ?>
<?php if ($error): ?><div class="notice error" role="alert"><?= e($error) ?></div><?php endif ?>
<?php if ($unavailable): ?><div class="notice error" role="alert">The workspace is temporarily unavailable. Please contact your administrator or try again shortly.</div><?php endif ?>
<form method="post" class="stack"><input type="hidden" name="csrf" value="<?= e(csrf()) ?>"><input type="hidden" name="action" value="login">
<label>Email address<input type="email" name="email" autocomplete="username" maxlength="190" placeholder="you@college.edu.my" value="<?= e($_POST['email'] ?? '') ?>" required></label>
<label>Password<span class="password-field"><input type="password" id="password" name="password" autocomplete="current-password" required><button type="button" class="password-toggle" aria-controls="password" aria-pressed="false" aria-label="Show password">Show</button></span></label>
<button class="button primary wide" <?= $unavailable ? 'disabled' : '' ?>>Sign in <?= icon('arrow') ?></button>
</form><p class="login-help">Need access? Ask your workspace administrator.</p><div class="login-footer">Built around learning.<span>Student grading workspace</span></div>
</div></section></main>
<?php else: ?>
<a class="skip-link" href="#main">Skip to content</a>
<aside class="sidebar"><a class="brand" href="<?= e(url('register')) ?>"><span class="brand-mark">g.</span> gradebook<span class="brand-dot">/</span></a><div class="workspace-label">TEACHING WORKSPACE</div>
<nav aria-label="Main navigation"><?php foreach (['register' => 'Marks register', 'students' => 'Students', 'subjects' => 'Subjects', 'performance' => 'Performance'] as $key => $label): $active = $view === $key || ($key === 'register' && in_array($view, ['form', 'result'], true)); ?>
<a href="<?= e(url($key)) ?>" class="nav-item <?= $active ? 'active' : '' ?>" <?= $active ? 'aria-current="page"' : '' ?>><?= icon($key) ?><span><?= e($label) ?></span><?php if ($key === 'register'): ?><span class="nav-count"><?= count($records) ?></span><?php endif ?></a>
<?php endforeach ?></nav>
<div class="sidebar-note"><span class="small-label">THE BIGGER PICTURE</span><p>Small steps.<br>Meaningful progress.</p><span class="muted">Every result is a chance to grow.</span></div>
<div class="user-block"><span class="avatar"><?= e(mb_strtoupper(mb_substr($user['name'], 0, 1))) ?></span><div><strong><?= e($user['name']) ?></strong><span>Educator</span></div><form method="post"><input type="hidden" name="csrf" value="<?= e(csrf()) ?>"><input type="hidden" name="action" value="logout"><button class="icon-button" aria-label="Sign out" title="Sign out"><?= icon('logout') ?></button></form></div></aside>
<div class="app-shell"><header class="topbar"><span class="breadcrumb">Workspace <span>/</span> <strong><?= e($titles[$view] ?? '') ?></strong></span><span class="topbar-caption">A clearer view of learning.</span></header>
<main id="main" class="main" tabindex="-1">
<?php if ($flash): ?><div class="notice success" role="status"><?= icon('check') ?> <?= e($flash) ?></div><?php endif ?>
<?php if ($error): ?><div class="notice error" role="alert"><?= e($error) ?></div><?php endif ?>
<?php if ($unavailable): ?><section class="empty-state"><h1>We couldn’t load your workspace.</h1><p>The database is temporarily unavailable. Your saved work is still in the database.</p><a class="button primary" href="<?= e(url($view)) ?>">Try again</a></section>
<?php else: require __DIR__ . '/pages.php'; endif ?>
<footer class="page-footer"><span>Gradebook / A clearer view of learning.</span><span>Made for meaningful progress.</span></footer>
</main></div>
<dialog id="delete-dialog" aria-labelledby="delete-heading"><form method="post"><input type="hidden" name="csrf" value="<?= e(csrf()) ?>"><input type="hidden" name="action" value="delete_record"><input type="hidden" name="id" id="delete-id"><span class="eyebrow">REMOVE RESULT</span><h2 id="delete-heading">Delete this result?</h2><p id="delete-description">This permanently removes the marks and feedback. The student and subject stay in your directory.</p><div class="form-actions"><button class="button secondary" type="button" data-close-dialog>Keep result</button><button class="button danger">Delete result</button></div></form></dialog>
<?php endif ?>
</body></html>
