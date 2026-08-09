"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AIProviderConfig,
  AppSettings,
  Difficulty,
  DietType,
  Flavor,
  Ingredient,
  LogEntry,
  MealType,
  NutrientKey,
  Recipe,
  RecipeInput,
  RecommendationHistory,
} from "../lib/types";
import { clearBusinessData, historyStore, logStore, recipeStore, settingsStore } from "../lib/storage";
import { AppError, toAppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { recommendRecipes } from "../lib/recommendation";
import { createBackup, parseBackup } from "../lib/backup";
import { AIRequestError, formatRecipeTokenUsageLog, generateRecipeDraft, normalizeAIConfig, resolveAIRequestTarget, testAIVisionCapability } from "../lib/ai";
import { isAiSupportedImage, isHeicImage, normalizeRecipeImageFile } from "../lib/images";
import { isAndroidNativeBackupAvailable, openAndroidSavedBackup, saveBackupWithAndroid, type NativeBackupSaveResult } from "../lib/native-backup";
import { ImageEditorDialog } from "./ImageEditorDialog";
import { calculateRecipeNutrition, formatFoodDisplayLabel, formatNutrientValue, getFoodReference, LOCAL_NUTRITION_DATA_INFO, NUTRIENT_KEYS, NUTRIENT_META, searchFoods, suggestIngredientNutrition } from "../lib/nutrition";
import { findDuplicateRecipeByName } from "../lib/recipe-name";

type View = "recipes" | "recommend" | "backup" | "settings";
type EditorMode = "create" | "edit";

const FLAVORS: Flavor[] = ["清淡", "辛辣", "酸甜", "咸鲜", "麻辣", "鲜香"];
const MEALS: Array<{ value: MealType; label: string }> = [
  { value: "breakfast", label: "早餐" },
  { value: "lunch", label: "午餐" },
  { value: "dinner", label: "晚餐" },
];
const DEFAULT_TAGS = ["快手菜", "下饭", "汤羹", "凉菜", "主食", "家常", "周末"];
const DIET_TYPES: DietType[] = ["荤菜", "素菜", "主食", "汤羹"];
const DIFFICULTIES: Difficulty[] = ["简单", "适中", "进阶"];

const SAMPLE_RECIPES: Recipe[] = [
  sampleRecipe("番茄炒蛋", "酸甜", "素菜", ["lunch", "dinner"], ["快手菜", "下饭"], 15, ["番茄", "鸡蛋"], ["番茄切块，鸡蛋打散。", "鸡蛋炒熟盛出。", "番茄炒出汁，放回鸡蛋调味。"]),
  sampleRecipe("清炒时蔬", "清淡", "素菜", ["lunch", "dinner"], ["快手菜", "家常"], 12, ["当季青菜", "蒜"], ["青菜洗净沥水。", "热锅爆香蒜末，大火快炒。"]),
  sampleRecipe("可乐鸡翅", "咸鲜", "荤菜", ["lunch", "dinner"], ["下饭", "周末"], 35, ["鸡翅", "可乐", "姜"], ["鸡翅焯水。", "煎至两面金黄，加入可乐和姜。", "小火焖煮后收汁。"]),
  sampleRecipe("小米南瓜粥", "清淡", "主食", ["breakfast"], ["主食", "家常"], 35, ["小米", "南瓜"], ["小米淘洗，南瓜切块。", "加水煮开后小火煮至浓稠。"]),
  sampleRecipe("紫菜蛋花汤", "鲜香", "汤羹", ["lunch", "dinner"], ["汤羹", "快手菜"], 10, ["紫菜", "鸡蛋"], ["水开后放紫菜。", "淋入蛋液，调味后关火。"]),
];

function sampleRecipe(
  name: string,
  flavor: Flavor,
  dietType: DietType,
  meals: MealType[],
  tags: string[],
  duration: number,
  ingredients: string[],
  steps: string[],
): Recipe {
  const now = new Date().toISOString();
  return {
    id: `sample-${name}`,
    name,
    description: "适合日常餐桌的中式家常菜。",
    ingredients: ingredients.map((item) => ({ id: crypto.randomUUID(), name: item, amount: "适量", unit: "" })),
    steps,
    meals,
    flavors: [flavor],
    tags,
    dietType,
    duration,
    difficulty: "简单",
    incomplete: false,
    createdAt: now,
    updatedAt: now,
  };
}

function emptyRecipe(): RecipeInput {
  return {
    name: "",
    description: "",
    ingredients: [{ id: crypto.randomUUID(), name: "", amount: "", unit: "" }],
    steps: [""],
    meals: ["dinner"],
    flavors: [],
    tags: [],
    dietType: "荤菜",
    duration: 20,
    difficulty: "简单",
    incomplete: true,
  };
}

function mealLabel(meal: MealType) {
  return MEALS.find((item) => item.value === meal)?.label || meal;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function endpointHost(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid-endpoint";
  }
}

function defaultBackupFilename() {
  return `灶房菜谱备份-${new Date().toISOString().slice(0, 10)}.zip`;
}

function ErrorNotice({ error, onClose }: { error?: AppError; onClose: () => void }) {
  if (!error) return null;
  return (
    <div className="toast error-toast" role="alert">
      <div>
        <strong>{error.userMessage}</strong>
        <small>错误编号：{error.code}</small>
      </div>
      <button className="icon-button" aria-label="关闭错误提示" onClick={onClose}>×</button>
    </div>
  );
}

function ImageThumb({ recipe, large = false }: { recipe: Recipe; large?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!recipe.image) return;
    const next = URL.createObjectURL(recipe.image);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [recipe.image]);
  return (
    <div className={`recipe-image ${large ? "recipe-image-large" : ""}`}>
      {url ? <img src={url} alt={`${recipe.name}菜品照片`} /> : <span aria-hidden="true">食</span>}
    </div>
  );
}

export default function RecipeApp() {
  const [view, setView] = useState<View>("recipes");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [history, setHistory] = useState<RecommendationHistory[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    debugMode: false,
    ai: { endpoint: "https://api.deepseek.com/chat/completions", model: "", apiKey: "", enabled: false },
    nutrition: { visibleNutrients: ["energyKcal", "proteinG", "carbohydrateG", "fatG"], estimatePeople: 2 },
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError>();
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{ mode: EditorMode; value: RecipeInput; id?: string }>();
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe>();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Recipe>();
  const [duplicateSave, setDuplicateSave] = useState<{ input: RecipeInput; id?: string; existing: Recipe }>();

  const reloadLogs = useCallback(() => logStore.all().then(setLogs).catch(() => undefined), []);

  useEffect(() => {
    const load = async () => {
      try {
        const [storedRecipes, storedSettings, storedHistory] = await Promise.all([
          recipeStore.all(),
          settingsStore.get(),
          historyStore.all(),
        ]);
        if (!storedRecipes.length) {
          for (const recipe of SAMPLE_RECIPES) await recipeStore.put(recipe);
          setRecipes(SAMPLE_RECIPES);
        } else setRecipes(storedRecipes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        setSettings(storedSettings);
        setHistory(storedHistory);
        await logger.info("app", "startup_ready", undefined, { result: "success" });
        await reloadLogs();
      } catch (caught) {
        setError(toAppError(caught, "STORAGE"));
      } finally {
        setLoading(false);
      }
    };
    void load();
    const onUnhandled = (event: PromiseRejectionEvent) => {
      const appError = toAppError(event.reason);
      void logger.error("global", "unhandled_rejection", undefined, { errorCode: appError.code, message: appError.message });
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((caught) => {
        const appError = toAppError(caught, "PWA");
        void logger.warn("pwa", "registration_failed", undefined, { errorCode: appError.code, message: appError.message });
      });
    }
    return () => window.removeEventListener("unhandledrejection", onUnhandled);
  }, [reloadLogs]);

  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return recipes;
    return recipes.filter((recipe) =>
      [recipe.name, recipe.description, ...recipe.flavors, ...recipe.tags, ...recipe.ingredients.map((item) => item.name)]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [recipes, search]);

  async function saveRecipe(input: RecipeInput, id?: string, allowDuplicate = false) {
    const operationId = crypto.randomUUID();
    const started = performance.now();
    try {
      if (!input.name.trim() && !input.description.trim() && !input.image) {
        throw new AppError("VALIDATION", "至少填写菜名、说明或上传图片");
      }
      const duplicate = !allowDuplicate ? findDuplicateRecipeByName(recipes, input.name, id) : undefined;
      if (duplicate) {
        setDuplicateSave({ input, id, existing: duplicate });
        await logger.warn("recipe", "duplicate_name_detected", operationId, { result: "confirmation_required" });
        await reloadLogs();
        return;
      }
      const existing = id ? recipes.find((item) => item.id === id) : undefined;
      const now = new Date().toISOString();
      const recipe: Recipe = {
        ...input,
        name: input.name.trim() || "待完善菜谱",
        ingredients: input.ingredients.filter((item) => item.name.trim()),
        steps: input.steps.filter((step) => step.trim()),
        incomplete: !input.name.trim() || !input.ingredients.some((item) => item.name.trim()) || !input.steps.some((step) => step.trim()),
        id: id || crypto.randomUUID(),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await recipeStore.put(recipe);
      setRecipes((current) => [recipe, ...current.filter((item) => item.id !== recipe.id)]);
      setDuplicateSave(undefined);
      setEditor(undefined);
      setSelectedRecipe(recipe);
      setNotice(existing ? "菜谱已更新" : "菜谱已保存到本机");
      await logger.info("recipe", existing ? "recipe_updated" : "recipe_created", operationId, {
        result: "success",
        durationMs: Math.round(performance.now() - started),
      });
      await reloadLogs();
    } catch (caught) {
      const appError = toAppError(caught, caught instanceof AppError ? caught.kind : "STORAGE");
      setError(appError);
      await logger.error("recipe", "recipe_save_failed", operationId, {
        result: "failed",
        errorCode: appError.code,
        message: appError.message,
        durationMs: Math.round(performance.now() - started),
      });
    }
  }

  async function deleteRecipe(recipe: Recipe) {
    const operationId = crypto.randomUUID();
    try {
      await recipeStore.delete(recipe.id);
      setRecipes((current) => current.filter((item) => item.id !== recipe.id));
      setSelectedRecipe(undefined);
      setDeleteTarget(undefined);
      setNotice("菜谱和关联图片已删除");
      await logger.info("recipe", "recipe_deleted", operationId, { result: "success" });
      await reloadLogs();
    } catch (caught) {
      const appError = toAppError(caught, "STORAGE");
      setError(appError);
      await logger.error("recipe", "recipe_delete_failed", operationId, { errorCode: appError.code, message: appError.message });
    }
  }

  function editExisting(recipe: Recipe) {
    const { id, createdAt, updatedAt, ...value } = recipe;
    setEditor({ mode: "edit", id, value });
    setSelectedRecipe(undefined);
  }

  const navItems: Array<{ id: View; label: string; hint: string }> = [
    { id: "recipes", label: "我的菜谱", hint: `${recipes.length} 道` },
    { id: "recommend", label: "今日推荐", hint: "本地规则" },
    { id: "backup", label: "数据管家", hint: "导入导出" },
    { id: "settings", label: "设置与诊断", hint: settings.debugMode ? "调试中" : "本机" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("recipes")}>
          <span className="brand-mark">灶</span>
          <span><strong>灶房</strong><small>本地菜谱</small></span>
        </button>
        <nav aria-label="主要功能">
          {navItems.map((item) => (
            <button key={item.id} className={view === item.id ? "nav-active" : ""} onClick={() => setView(item.id)}>
              <span>{item.label}</span><small>{item.hint}</small>
            </button>
          ))}
        </nav>
        <div className="privacy-card">
          <span className="status-dot" />
          <div><strong>数据留在本机</strong><small>未启用云端数据库</small></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="mobile-header">
          <div className="brand"><span className="brand-mark">灶</span><strong>灶房</strong></div>
          <select aria-label="切换功能" value={view} onChange={(event) => setView(event.target.value as View)}>
            {navItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </header>

        {loading ? (
          <div className="loading-state"><span className="loader" /><p>正在打开你的本地菜谱…</p></div>
        ) : (
          <>
            {view === "recipes" && (
              <RecipesView
                recipes={filteredRecipes}
                settings={settings}
                total={recipes.length}
                search={search}
                onSearch={setSearch}
                onCreate={() => { setEditor({ mode: "create", value: emptyRecipe() }); setSelectedRecipe(undefined); }}
                onSelect={setSelectedRecipe}
                onEdit={editExisting}
                onDelete={setDeleteTarget}
              />
            )}
            {view === "recommend" && (
              <RecommendView recipes={recipes} history={history} settings={settings} onHistory={async (entry) => {
                await historyStore.put(entry);
                setHistory((current) => [...current, entry]);
              }} />
            )}
            {view === "backup" && (
              <BackupView
                recipes={recipes}
                history={history}
                settings={settings}
                onImported={async (nextRecipes, nextHistory, importedSettings) => {
                  setRecipes(nextRecipes);
                  setHistory(nextHistory);
                  const nextSettings = { ...settings, debugMode: importedSettings.debugMode, nutrition: importedSettings.nutrition };
                  await settingsStore.put(nextSettings);
                  setSettings(nextSettings);
                  setNotice(`成功导入 ${nextRecipes.length} 道菜谱`);
                }}
                onCleared={() => { setRecipes([]); setHistory([]); setNotice("本地业务数据已清空"); }}
                onError={setError}
                refreshLogs={reloadLogs}
              />
            )}
            {view === "settings" && (
              <SettingsView
                settings={settings}
                logs={logs}
                onSettings={async (next) => {
                  await settingsStore.put(next);
                  setSettings(next);
                  await logger.info("settings", "settings_updated", undefined, { result: "success" });
                  await reloadLogs();
                  setNotice("设置已保存在本机");
                }}
                refreshLogs={reloadLogs}
                onError={setError}
              />
            )}
          </>
        )}
      </main>

      {editor && (
        <RecipeEditor
          editor={editor}
          settings={settings}
          onChange={(value) => setEditor((current) => current ? { ...current, value } : current)}
          onCancel={() => setEditor(undefined)}
          onSave={() => void saveRecipe(editor.value, editor.id)}
          onError={setError}
          refreshLogs={reloadLogs}
        />
      )}
      {selectedRecipe && (
        <RecipeDetail recipe={selectedRecipe} visibleNutrients={settings.nutrition.visibleNutrients} onClose={() => setSelectedRecipe(undefined)} onEdit={() => editExisting(selectedRecipe)} />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title={`删除“${deleteTarget.name}”？`}
          body="菜谱和关联图片将从当前设备永久删除，此操作无法撤销。"
          confirmLabel="确认删除"
          onCancel={() => setDeleteTarget(undefined)}
          onConfirm={() => void deleteRecipe(deleteTarget)}
        />
      )}
      {duplicateSave && (
        <ConfirmDialog
          title="已存在同名菜谱"
          body={`“${duplicateSave.existing.name}”已经保存在本机。建议返回修改菜名；如果仍然保存，将保留两条同名菜谱。`}
          confirmLabel="仍然保存"
          onCancel={() => setDuplicateSave(undefined)}
          onConfirm={() => {
            const pending = duplicateSave;
            setDuplicateSave(undefined);
            return saveRecipe(pending.input, pending.id, true);
          }}
        />
      )}
      <ErrorNotice error={error} onClose={() => setError(undefined)} />
      {notice && <div className="toast success-toast" role="status">{notice}<button className="icon-button" onClick={() => setNotice("")}>×</button></div>}
    </div>
  );
}

function RecipesView({
  recipes,
  settings,
  total,
  search,
  onSearch,
  onCreate,
  onSelect,
  onEdit,
  onDelete,
}: {
  recipes: Recipe[];
  settings: AppSettings;
  total: number;
  search: string;
  onSearch: (value: string) => void;
  onCreate: () => void;
  onSelect: (recipe: Recipe) => void;
  onEdit: (recipe: Recipe) => void;
  onDelete: (recipe: Recipe) => void;
}) {
  return (
    <section className="page-section">
      <div className="page-heading">
        <div><span className="eyebrow">私人菜谱库 · 仅此设备</span><h1>今天想做什么菜？</h1><p>收好家里的味道，也为下一餐留一点灵感。</p></div>
        <button className="button-primary" onClick={onCreate}><span>＋</span> 添加菜谱</button>
      </div>
      <div className="toolbar">
        <label className="search-field"><span>⌕</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索菜名、食材或标签" /></label>
        <span className="recipe-count">共 {total} 道菜谱</span>
      </div>
      {recipes.length ? (
        <div className="recipe-grid">
          {recipes.map((recipe) => (
            <article className="recipe-card" key={recipe.id}>
              <button className="card-open" onClick={() => onSelect(recipe)}>
                <ImageThumb recipe={recipe} />
                <div className="card-body">
                  <div className="card-meta"><span>{recipe.dietType}</span><span>{recipe.duration} 分钟</span></div>
                  <h2>{recipe.name}</h2>
                  <p>{recipe.description || "还没有补充说明"}</p>
                  <NutritionSummary recipe={recipe} visibleNutrients={settings.nutrition.visibleNutrients} compact />
                  <div className="tag-row">{[...recipe.flavors, ...recipe.tags].slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div>
                  {recipe.incomplete && <span className="draft-badge">待完善</span>}
                </div>
              </button>
              <div className="card-actions">
                <button onClick={() => onEdit(recipe)}>编辑</button>
                <button className="danger-link" onClick={() => onDelete(recipe)}>删除</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state"><span>空</span><h2>还没有找到合适的菜谱</h2><p>换个关键词，或录入一道新菜。</p><button className="button-primary" onClick={onCreate}>添加第一道菜</button></div>
      )}
    </section>
  );
}

function RecipeEditor({
  editor,
  settings,
  onChange,
  onCancel,
  onSave,
  onError,
  refreshLogs,
}: {
  editor: { mode: EditorMode; value: RecipeInput };
  settings: AppSettings;
  onChange: (value: RecipeInput) => void;
  onCancel: () => void;
  onSave: () => void;
  onError: (error: AppError) => void;
  refreshLogs: () => Promise<void>;
}) {
  const value = editor.value;
  const hasName = Boolean(value.name.trim());
  const hasTextInput = Boolean(value.name.trim() || value.description.trim());
  const aiImage = isAiSupportedImage(value.image) ? value.image : undefined;
  const [parsing, setParsing] = useState(false);
  const [parseNotice, setParseNotice] = useState("");
  const [imageEditor, setImageEditor] = useState<{ source: Blob; sourceName: string }>();
  const abortRef = useRef<AbortController | null>(null);
  const [customTag, setCustomTag] = useState("");
  const patch = <K extends keyof RecipeInput>(key: K, next: RecipeInput[K]) => onChange({ ...value, [key]: next });

  async function generateDraft(mode: "image" | "text") {
    const hasName = Boolean(value.name.trim());
    const hasTextInput = Boolean(value.name.trim() || value.description.trim());
    const aiImage = mode === "image" && isAiSupportedImage(value.image) ? value.image : undefined;
    const source = aiImage ? "image" : "name";
    if (mode === "image" && !aiImage) {
      setParseNotice(value.image ? "该图片暂不能用于图片 AI，请换成 JPG/PNG/WebP，或改用“仅文字生成”。" : "请先上传可用图片。");
      return;
    }
    if (mode === "text" && !hasTextInput) {
      setParseNotice("仅文字生成需要先填写菜名或原始说明。");
      return;
    }
    if (!settings.ai.enabled) {
      setParseNotice("设置中尚未打开“允许使用 AI 生成”，不会调用模型。");
      return;
    }
    if (!settings.ai.endpoint || !settings.ai.model || !settings.ai.apiKey) {
      setParseNotice("请先在设置中填写接口地址、模型名和 API Key。");
      return;
    }
    const operationId = crypto.randomUUID();
    const started = performance.now();
    abortRef.current = new AbortController();
    setParsing(true);
    setParseNotice(aiImage
      ? (hasName || value.description.trim() ? "仅发送当前图片和已填写文字，正在识别…" : "仅发送当前图片，正在识别菜名、食材和制作步骤…")
      : "仅发送本次菜名和补充文字，正在等待模型返回…");
    try {
      const parsed = await generateRecipeDraft({
        image: aiImage,
        name: value.name,
        description: value.description,
        estimatePeople: settings.nutrition.estimatePeople,
        config: settings.ai,
        signal: abortRef.current.signal,
        onUsage: async (usage) => {
          await logger.info("ai", "recipe_token_usage", operationId, {
            result: usage.available ? "reported" : "unavailable",
            stage: source,
            persist: true,
            message: formatRecipeTokenUsageLog(usage),
          });
          await refreshLogs();
        },
      });
      onChange({
        ...value,
        ...parsed,
        image: value.image,
        imageName: value.imageName,
        ingredients: (parsed.ingredients || value.ingredients).map((item) => suggestIngredientNutrition({ ...item, id: item.id || crypto.randomUUID() })),
      });
      setParseNotice(`识别完成，已按 ${settings.nutrition.estimatePeople} 人用量估算食材克数；请修正确认后保存到本机。`);
      await logger.info("ai", "recipe_generate_success", operationId, { result: "success", stage: source, durationMs: Math.round(performance.now() - started) });
    } catch (caught) {
      const error = toAppError(caught, "NETWORK");
      if (abortRef.current?.signal.aborted) setParseNotice("已取消解析，原始图片和文字仍在。");
      else {
        onError(error);
        setParseNotice(caught instanceof AIRequestError
          ? `解析失败：${caught.suggestion}${isNativeAppRuntime() ? `（设备网络：${sanitizeNetworkDetail(caught.message)}）` : ""}`
          : "解析失败，原始图片和文字已保留，可直接保存。");
      }
      await logger.warn("ai", "recipe_generate_failed", operationId, {
        stage: source,
        result: caught instanceof AIRequestError ? caught.failure : "failed",
        errorCode: error.code,
        message: caught instanceof AIRequestError ? `host=${endpointHost(settings.ai.endpoint)};model=${settings.ai.model};image=${Boolean(aiImage)};status=${caught.status || "none"};failure=${caught.failure};detail=${sanitizeNetworkDetail(caught.message)}` : error.message,
        durationMs: Math.round(performance.now() - started),
      });
    } finally {
      setParsing(false);
    }
  }

  return (
    <>
    <div className="modal-backdrop">
      <section className="drawer editor-drawer" role="dialog" aria-modal="true" aria-label={editor.mode === "create" ? "添加菜谱" : "编辑菜谱"}>
        <header className="drawer-header">
          <div><span className="eyebrow">{editor.mode === "create" ? "收下一道新味道" : "修改菜谱"}</span><h2>{editor.mode === "create" ? "添加菜谱" : value.name}</h2></div>
          <button className="icon-button close-button" onClick={onCancel} aria-label="取消并关闭">×</button>
        </header>
        <div className="editor-content">
          <section className="form-section image-upload-section">
            <div className="section-title"><span>01</span><div><h3>菜品图片与说明</h3><p>AI 生成需要先在设置中开启，并由你点击按钮触发。</p></div></div>
            <label className="image-drop">
              {value.image ? <ImagePreview blob={value.image} /> : <span className="upload-placeholder"><b>＋</b>选择或拍摄菜品图片<small>支持 JPG、PNG、WebP、HEIC</small></span>}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" capture="environment" onChange={(event) => {
                const input = event.currentTarget;
                const file = event.target.files?.[0];
                if (file) void (async () => {
                  try {
                    setParseNotice(isHeicImage(file) ? "正在将 HEIC 图片转换为 JPEG…" : "");
                    const normalized = await normalizeRecipeImageFile(file);
                    onChange({ ...value, image: normalized.file, imageName: normalized.file.name });
                    if (isAiSupportedImage(normalized.file)) {
                      setImageEditor({ source: normalized.file, sourceName: normalized.file.name });
                    }
                    if (normalized.status === "converted") setParseNotice("HEIC 图片已在本机转换为 JPEG，可继续裁剪、保存或智能生成。");
                    else if (normalized.status === "unsupported") {
                      setParseNotice("已保留原始 HEIC，可保存；该图片暂不能用于图片 AI，请填写菜名生成或换成 JPG/PNG/WebP。");
                      await logger.warn("image", "heic_conversion_unsupported", undefined, {
                        result: "unsupported",
                        message: normalized.failureSummary,
                      });
                    }
                  } catch (caught) {
                    const error = toAppError(caught, "IMAGE");
                    onError(error);
                    setParseNotice(error.message);
                  } finally {
                    input.value = "";
                  }
                })();
              }} />
            </label>
            {value.image && isAiSupportedImage(value.image) && (
              <div className="image-edit-actions">
                <button className="button-secondary" onClick={() => setImageEditor({ source: value.image!, sourceName: value.imageName || "recipe-image.jpg" })}>裁剪 / 旋转 / 缩放</button>
                <small>编辑过程完全在本机完成，应用后保存为 JPEG。</small>
              </div>
            )}
            <label className="field"><span>原始说明</span><textarea rows={3} value={value.description} onChange={(event) => patch("description", event.target.value)} placeholder="例如：外婆做的红烧肉，偏甜口……" /></label>
            <div className="parse-panel">
              <div><strong>智能生成</strong><small>{settings.ai.enabled ? (settings.ai.apiKey ? `使用 ${settings.ai.model || "已配置模型"} · 按 ${settings.nutrition.estimatePeople} 人估算` : "尚未配置 API Key") : "设置中未开启"}</small></div>
              {parsing ? <button className="button-secondary" onClick={() => abortRef.current?.abort()}>取消生成</button> : (
                <div className="button-row ai-action-row">
                  <button className="button-secondary" disabled={!hasTextInput} onClick={() => void generateDraft("text")}>仅文字生成</button>
                  <button className="button-primary" disabled={!aiImage} onClick={() => void generateDraft("image")}>{hasName ? "图片+文字识别" : "识别图片并填充"}</button>
                </div>
              )}
            </div>
            {parseNotice && <p className="inline-notice">{parseNotice}</p>}
          </section>
          <section className="form-section">
            <div className="section-title"><span>02</span><div><h3>基本信息</h3><p>菜名可留空并保存为待完善菜谱。</p></div></div>
            <div className="two-columns">
              <label className="field field-wide"><span>菜名</span><input value={value.name} onChange={(event) => patch("name", event.target.value)} placeholder="例如：糖醋排骨" /></label>
              <label className="field"><span>耗时（分钟）</span><input type="number" min={1} max={600} value={value.duration} onChange={(event) => patch("duration", Number(event.target.value))} /></label>
              <label className="field"><span>分类</span><select value={value.dietType} onChange={(event) => patch("dietType", event.target.value as DietType)}>{DIET_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="field"><span>难度</span><select value={value.difficulty} onChange={(event) => patch("difficulty", event.target.value as Difficulty)}>{DIFFICULTIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <ChoiceGroup title="适用餐次" options={MEALS.map((item) => item.value)} selected={value.meals} label={mealLabel} onChange={(items) => patch("meals", items as MealType[])} />
            <ChoiceGroup title="口味" options={FLAVORS} selected={value.flavors} onChange={(items) => patch("flavors", items as Flavor[])} />
            <ChoiceGroup title="标签" options={DEFAULT_TAGS} selected={value.tags} onChange={(items) => patch("tags", items)} />
            <div className="custom-tag-row">
              <input aria-label="自定义标签" value={customTag} onChange={(event) => setCustomTag(event.target.value)} placeholder="添加自定义标签" />
              <button className="button-secondary" onClick={() => {
                const tag = customTag.trim();
                if (tag && !value.tags.includes(tag)) patch("tags", [...value.tags, tag]);
                setCustomTag("");
              }}>添加</button>
            </div>
          </section>
          <section className="form-section">
            <div className="section-title"><span>03</span><div><h3>食材</h3><p>用量按原菜谱记录，不随推荐人数自动换算。</p></div></div>
            <div className="nutrition-match-toolbar">
              <span>输入中文后会通过本地别名匹配 USDA 标准食品；中英文结果需要你确认。</span>
              <button className="button-secondary" onClick={() => patch("ingredients", value.ingredients.map(suggestIngredientNutrition))}>自动匹配全部</button>
            </div>
            <div className="dynamic-list">
              {value.ingredients.map((ingredient, index) => {
                const suggestedFoods = searchFoods(ingredient.name, 8);
                const selectedFood = getFoodReference(ingredient.foodId);
                const options = selectedFood && !suggestedFoods.some((food) => food.id === selectedFood.id) ? [selectedFood, ...suggestedFoods] : suggestedFoods;
                return (
                  <div className="ingredient-entry" key={ingredient.id}>
                    <div className="ingredient-row">
                      <span className="row-index">{index + 1}</span>
                      <input aria-label={`食材${index + 1}名称`} placeholder="食材" value={ingredient.name} onChange={(event) => {
                        const next = [...value.ingredients]; next[index] = { ...ingredient, name: event.target.value, foodId: undefined, foodName: undefined, nutritionMatch: "unmatched" }; patch("ingredients", next);
                      }} />
                      <input aria-label={`食材${index + 1}用量`} placeholder="用量" value={ingredient.amount} onChange={(event) => {
                        const next = [...value.ingredients]; next[index] = { ...ingredient, amount: event.target.value }; patch("ingredients", next);
                      }} />
                      <input aria-label={`食材${index + 1}单位`} placeholder="单位" value={ingredient.unit} onChange={(event) => {
                        const next = [...value.ingredients]; next[index] = { ...ingredient, unit: event.target.value }; patch("ingredients", next);
                      }} />
                      <button className="icon-button" onClick={() => patch("ingredients", value.ingredients.filter((_, i) => i !== index))}>×</button>
                    </div>
                    <div className="ingredient-nutrition-row">
                      <label><span>可食重量</span><input type="number" min="0" step="1" aria-label={`食材${index + 1}可食重量克`} placeholder="克" value={ingredient.grams || ""} onChange={(event) => {
                        const next = [...value.ingredients]; next[index] = { ...ingredient, grams: Number(event.target.value) > 0 ? Number(event.target.value) : undefined }; patch("ingredients", next);
                      }} /></label>
                      <label><span>标准食材</span><select aria-label={`食材${index + 1}标准食材`} value={ingredient.foodId || ""} onChange={(event) => {
                        const food = getFoodReference(event.target.value);
                        const next = [...value.ingredients]; next[index] = { ...ingredient, foodId: food?.id, foodName: food?.name, nutritionMatch: food ? "confirmed" : "unmatched" }; patch("ingredients", next);
                      }}><option value="">未匹配</option>{options.map((food) => <option key={food.id} value={food.id}>{formatFoodDisplayLabel(food, ingredient.name)}</option>)}</select></label>
                      <span className={`nutrition-match-status ${ingredient.foodId && ingredient.grams ? "ready" : "missing"}`}>{ingredient.foodId ? (ingredient.grams ? "可计算" : "缺少克数") : "未匹配"}</span>
                    </div>
                  </div>
                );
              })}
              <button className="add-row" onClick={() => patch("ingredients", [...value.ingredients, { id: crypto.randomUUID(), name: "", amount: "", unit: "" }])}>＋ 添加食材</button>
            </div>
          </section>
          <section className="form-section">
            <div className="section-title"><span>04</span><div><h3>制作步骤</h3><p>按实际顺序记录，空步骤不会保存。</p></div></div>
            <div className="dynamic-list">
              {value.steps.map((step, index) => (
                <div className="step-row" key={index}>
                  <span className="row-index">{index + 1}</span>
                  <textarea rows={2} aria-label={`步骤${index + 1}`} value={step} onChange={(event) => {
                    const next = [...value.steps]; next[index] = event.target.value; patch("steps", next);
                  }} placeholder="描述这一步怎么做" />
                  <button className="icon-button" onClick={() => patch("steps", value.steps.filter((_, i) => i !== index))}>×</button>
                </div>
              ))}
              <button className="add-row" onClick={() => patch("steps", [...value.steps, ""])}>＋ 添加步骤</button>
            </div>
          </section>
        </div>
        <footer className="drawer-footer"><button className="button-ghost" onClick={onCancel}>取消</button><button className="button-primary" onClick={onSave}>保存到本机</button></footer>
      </section>
    </div>
    {imageEditor && (
      <ImageEditorDialog
        source={imageEditor.source}
        sourceName={imageEditor.sourceName}
        onCancel={() => setImageEditor(undefined)}
        onApply={(file) => {
          onChange({ ...value, image: file, imageName: file.name });
          setImageEditor(undefined);
          setParseNotice("图片编辑完成，已应用裁剪、旋转和缩放效果。");
        }}
      />
    )}
    </>
  );
}

function isNativeAppRuntime() {
  return Boolean((globalThis as typeof globalThis & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
}

function sanitizeNetworkDetail(value: string) {
  return value.replace(/Bearer\s+\S+/gi, "Bearer <redacted>").replace(/https?:\/\/[^\s)]+/gi, "<endpoint>").slice(0, 120);
}

function ImagePreview({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(blob); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url ? <img src={url} alt="待保存的菜品预览" /> : null;
}

function ChoiceGroup<T extends string>({
  title,
  options,
  selected,
  label,
  onChange,
}: {
  title: string;
  options: T[];
  selected: T[];
  label?: (value: T) => string;
  onChange: (items: T[]) => void;
}) {
  return (
    <fieldset className="choice-group"><legend>{title}</legend><div className="chip-row">
      {options.map((option) => {
        const active = selected.includes(option);
        return <button type="button" className={active ? "chip-active" : ""} key={option} aria-pressed={active} onClick={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])}>{label ? label(option) : option}</button>;
      })}
    </div></fieldset>
  );
}

function NutritionSummary({ recipe, visibleNutrients, compact = false }: { recipe: Recipe; visibleNutrients: NutrientKey[]; compact?: boolean }) {
  const nutrition = calculateRecipeNutrition(recipe.ingredients);
  if (!visibleNutrients.length || !nutrition.calculatedCount) return null;
  return (
    <div className={compact ? "nutrition-summary nutrition-summary-compact" : "nutrition-summary"}>
      {visibleNutrients.map((key) => <span key={key}><small>{NUTRIENT_META[key].label}</small><strong>{formatNutrientValue(key, nutrition.totals[key])}</strong></span>)}
    </div>
  );
}

function RecipeNutritionDetail({ recipe, visibleNutrients }: { recipe: Recipe; visibleNutrients: NutrientKey[] }) {
  const nutrition = calculateRecipeNutrition(recipe.ingredients);
  if (!visibleNutrients.length) return <section className="nutrition-detail"><h3>营养指标</h3><p className="inline-notice">设置中尚未选择要展示的营养指标。</p></section>;
  return (
    <section className="nutrition-detail">
      <h3>营养指标</h3>
      {nutrition.calculatedCount ? <>
        <NutritionSummary recipe={recipe} visibleNutrients={visibleNutrients} />
        <div className="nutrition-density"><span>蛋白质密度</span><strong>{nutrition.proteinDensity.toFixed(1)} g / 100 kcal</strong></div>
        {!nutrition.complete && <p className="inline-notice">已计算 {nutrition.calculatedCount}/{nutrition.ingredientCount} 项食材；缺少克数或标准食材的部分未计入，结果可能偏低。</p>}
        <div className="nutrition-table-wrap"><table className="nutrition-table"><thead><tr><th>食材</th><th>重量</th>{visibleNutrients.map((key) => <th key={key}>{NUTRIENT_META[key].label}</th>)}</tr></thead><tbody>
          {nutrition.breakdown.filter((item) => item.ingredient.name.trim()).map((item) => <tr key={item.ingredient.id}><td>{item.ingredient.name}<small>{formatFoodDisplayLabel(item.food, item.ingredient.name)}</small></td><td>{item.grams ? `${item.grams}g` : "—"}</td>{visibleNutrients.map((key) => <td key={key}>{item.nutrients ? formatNutrientValue(key, item.nutrients[key]) : "—"}</td>)}</tr>)}
          <tr className="nutrition-total-row"><td>全菜总计</td><td>—</td>{visibleNutrients.map((key) => <td key={key}>{formatNutrientValue(key, nutrition.totals[key])}</td>)}</tr>
        </tbody></table></div>
      </> : <p className="inline-notice">尚未计算。编辑菜谱，为食材选择标准食材并填写可食重量。</p>}
    </section>
  );
}

function RecipeDetail({ recipe, visibleNutrients, onClose, onEdit }: { recipe: Recipe; visibleNutrients: NutrientKey[]; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="drawer detail-drawer" role="dialog" aria-modal="true" aria-label={`${recipe.name}详情`}>
        <header className="drawer-header"><div><span className="eyebrow">{recipe.meals.map(mealLabel).join(" · ")}</span><h2>{recipe.name}</h2></div><button className="icon-button close-button" onClick={onClose}>×</button></header>
        <div className="detail-content">
          <ImageThumb recipe={recipe} large />
          <div className="detail-stats"><span><b>{recipe.duration}</b>分钟</span><span><b>{recipe.difficulty}</b>难度</span><span><b>{recipe.dietType}</b>分类</span></div>
          <p className="detail-description">{recipe.description}</p>
          <div className="tag-row">{[...recipe.flavors, ...recipe.tags].map((tag) => <span key={tag}>#{tag}</span>)}</div>
          <RecipeNutritionDetail recipe={recipe} visibleNutrients={visibleNutrients} />
          <section><h3>准备食材</h3><ul className="ingredient-list">{recipe.ingredients.map((item) => <li key={item.id}><span>{item.name}</span><strong>{item.amount} {item.unit}</strong></li>)}</ul></section>
          <section><h3>开始制作</h3><ol className="steps-list">{recipe.steps.map((step, index) => <li key={index}><span>{index + 1}</span><p>{step}</p></li>)}</ol></section>
        </div>
        <footer className="drawer-footer"><button className="button-ghost" onClick={onClose}>关闭</button><button className="button-primary" onClick={onEdit}>编辑菜谱</button></footer>
      </section>
    </div>
  );
}

function RecommendView({
  recipes,
  history,
  settings,
  onHistory,
}: {
  recipes: Recipe[];
  history: RecommendationHistory[];
  settings: AppSettings;
  onHistory: (entry: RecommendationHistory) => Promise<void>;
}) {
  const [people, setPeople] = useState(2);
  const [meal, setMeal] = useState<MealType>("dinner");
  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [result, setResult] = useState<ReturnType<typeof recommendRecipes>>();
  const [fixedIds, setFixedIds] = useState<string[]>([]);
  const [salt, setSalt] = useState(0.17);
  const [selected, setSelected] = useState<Recipe>();
  const availableTags = useMemo(
    () => [...new Set([...DEFAULT_TAGS, ...recipes.flatMap((recipe) => recipe.tags)])],
    [recipes],
  );

  async function run(nextSalt = Math.random(), nextFixed = fixedIds) {
    const operationId = crypto.randomUUID();
    const started = performance.now();
    try {
      const next = recommendRecipes(recipes, { people, meal, flavors, tags }, history, nextFixed, nextSalt);
      setSalt(nextSalt);
      setFixedIds(nextFixed);
      setResult(next);
      const entry: RecommendationHistory = { id: crypto.randomUUID(), recipeIds: next.recipes.map((item) => item.id), meal, createdAt: new Date().toISOString() };
      await onHistory(entry);
      await logger.info("recommendation", "generated", operationId, {
        result: "success",
        durationMs: Math.round(performance.now() - started),
        message: `candidates=${recipes.length};selected=${next.recipes.length}`,
      });
    } catch (caught) {
      const error = toAppError(caught, "RECOMMENDATION");
      await logger.error("recommendation", "generate_failed", operationId, { errorCode: error.code, message: error.message });
    }
  }

  function replaceRecipe(id: string) {
    const keep = result?.recipes.filter((recipe) => recipe.id !== id).map((recipe) => recipe.id) || [];
    void run(Math.random(), keep);
  }

  return (
    <section className="page-section recommend-page">
      <div className="page-heading"><div><span className="eyebrow">不用联网 · 规则在本机运行</span><h1>为这一餐搭几道菜</h1><p>按人数、餐次和口味，从你的菜谱中挑选合适组合。</p></div></div>
      <div className="recommend-layout">
        <div className="recommend-form panel">
          <div className="recommend-number"><label>用餐人数</label><div className="stepper"><button onClick={() => setPeople(Math.max(1, people - 1))}>−</button><strong>{people}</strong><button onClick={() => setPeople(Math.min(20, people + 1))}>＋</button></div><small>默认推荐 {people + 1} 道菜</small></div>
          <ChoiceGroup title="餐次" options={MEALS.map((item) => item.value)} selected={[meal]} label={mealLabel} onChange={(items) => setMeal((items.at(-1) || "dinner") as MealType)} />
          <ChoiceGroup title="想吃的口味（可多选）" options={FLAVORS} selected={flavors} onChange={(items) => setFlavors(items as Flavor[])} />
          <ChoiceGroup title="偏好标签（可多选）" options={availableTags} selected={tags} onChange={setTags} />
          <button className="button-primary recommend-button" onClick={() => void run()}>生成本餐推荐 <span>→</span></button>
        </div>
        <div className="recommend-result">
          {!result ? (
            <div className="recommend-placeholder"><span>荐</span><h2>今晚的菜单，交给本地菜谱库</h2><p>选择左侧条件后生成推荐。你的偏好不会发送到任何服务器。</p></div>
          ) : (
            <>
              <div className="result-heading"><div><span className="eyebrow">本餐建议 · {result.recipes.length} 道</span><h2>{people} 人的{mealLabel(meal)}菜单</h2><p>{result.reason}</p></div><button className="button-secondary" onClick={() => void run()}>整组重选</button></div>
              <div className="recommend-cards">
                {result.recipes.map((recipe, index) => {
                  const fixed = fixedIds.includes(recipe.id);
                  return (
                    <article className="recommend-card" key={recipe.id}>
                      <button className="recommend-card-main" onClick={() => setSelected(recipe)}>
                        <span className="dish-number">{String(index + 1).padStart(2, "0")}</span>
                        <div><div className="card-meta"><span>{recipe.dietType}</span><span>{recipe.duration}分钟</span></div><h3>{recipe.name}</h3><p>{[...recipe.flavors, ...recipe.tags].slice(0, 3).join(" · ")}</p></div>
                      </button>
                      <div className="recommend-card-actions"><button className={fixed ? "fixed" : ""} onClick={() => setFixedIds((current) => fixed ? current.filter((id) => id !== recipe.id) : [...current, recipe.id])}>{fixed ? "已固定" : "固定"}</button><button onClick={() => replaceRecipe(recipe.id)}>换一道</button></div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      {selected && <RecipeDetail recipe={selected} visibleNutrients={settings.nutrition.visibleNutrients} onClose={() => setSelected(undefined)} onEdit={() => setSelected(undefined)} />}
    </section>
  );
}

function BackupView({
  recipes,
  settings,
  history,
  onImported,
  onCleared,
  onError,
  refreshLogs,
}: {
  recipes: Recipe[];
  settings: AppSettings;
  history: RecommendationHistory[];
  onImported: (recipes: Recipe[], history: RecommendationHistory[], settings: Pick<AppSettings, "debugMode" | "nutrition">) => void | Promise<void>;
  onCleared: () => void;
  onError: (error: AppError) => void;
  refreshLogs: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof parseBackup>>>();
  const [confirmClear, setConfirmClear] = useState(false);
  const [conflictStrategy, setConflictStrategy] = useState<"overwrite" | "keep" | "copy">("overwrite");
  const [exportDialog, setExportDialog] = useState<{ filename: string }>();
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<NativeBackupSaveResult | { filename: string; displayPath: string }>();
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportData(filename = defaultBackupFilename()) {
    const operationId = crypto.randomUUID();
    const started = performance.now();
    const safeFilename = filename.trim().toLowerCase().endsWith(".zip") ? filename.trim() : `${filename.trim() || defaultBackupFilename()}.zip`;
    setExporting(true);
    try {
      const blob = await createBackup(recipes, settings, history);
      const nativeExport = isAndroidNativeBackupAvailable();
      if (nativeExport) {
        const result = await saveBackupWithAndroid(blob, safeFilename);
        setExportResult(result);
      } else {
        downloadBlob(blob, safeFilename);
        setExportResult({ filename: safeFilename, displayPath: "浏览器下载目录" });
      }
      setExportDialog(undefined);
      await logger.info("backup", "export_success", operationId, {
        result: "success",
        stage: nativeExport ? "android_document_picker" : "browser_download",
        durationMs: Math.round(performance.now() - started),
        message: `records=${recipes.length};bytes=${blob.size}`,
      });
      await refreshLogs();
    } catch (caught) {
      if (String(caught instanceof Error ? caught.message : caught).includes("export_cancelled")) {
        setExportDialog(undefined);
        return;
      }
      const error = toAppError(caught, "BACKUP"); onError(error);
      await logger.error("backup", "export_failed", operationId, { errorCode: error.code, message: error.message });
    } finally {
      setExporting(false);
    }
  }

  async function openExportResult() {
    if (!exportResult || !("uri" in exportResult)) return;
    try {
      await openAndroidSavedBackup(exportResult.uri);
    } catch (caught) {
      onError(toAppError(caught, "BACKUP"));
    }
  }

  async function inspectFile(file?: File) {
    if (!file) return;
    const operationId = crypto.randomUUID();
    try {
      const parsed = await parseBackup(file);
      setPreview(parsed);
      await logger.info("backup", "import_validated", operationId, { result: "success", message: `records=${parsed.recipes.length};bytes=${file.size}` });
      await refreshLogs();
    } catch (caught) {
      const error = toAppError(caught, "BACKUP"); onError(error);
      await logger.error("backup", "import_validation_failed", operationId, { errorCode: error.code, message: error.message });
    }
  }

  async function importData() {
    if (!preview) return;
    const current = new Map(recipes.map((item) => [item.id, item]));
    let duplicates = 0;
    for (const recipe of preview.recipes) {
      if (!current.has(recipe.id)) {
        current.set(recipe.id, recipe);
        continue;
      }
      duplicates += 1;
      if (conflictStrategy === "overwrite") current.set(recipe.id, recipe);
      if (conflictStrategy === "copy") {
        const now = new Date().toISOString();
        const copyId = crypto.randomUUID();
        current.set(copyId, {
          ...recipe,
          id: copyId,
          name: `${recipe.name}（导入副本）`,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    const next = [...current.values()];
    try {
      await recipeStore.replaceAll(next);
      for (const item of preview.history) await historyStore.put(item);
      await onImported(next, [...history, ...preview.history], preview.settings);
      setPreview(undefined);
      await logger.info("backup", "import_committed", undefined, { result: "success", message: `records=${preview.recipes.length};duplicates=${duplicates}` });
      await refreshLogs();
    } catch (caught) {
      onError(toAppError(caught, "BACKUP"));
    }
  }

  return (
    <section className="page-section">
      <div className="page-heading"><div><span className="eyebrow">可迁移 · 可恢复 · 不上云</span><h1>把数据掌握在自己手里</h1><p>用完整 ZIP 备份迁移菜谱和图片，API Key 与诊断日志不会被打包。</p></div></div>
      <div className="backup-grid">
        <article className="backup-card export-card"><span className="backup-icon">出</span><div><span className="eyebrow">完整备份</span><h2>导出本地数据</h2><p>包含 {recipes.length} 道菜谱、图片、标签和推荐历史。</p><ul><li>版本化 JSON 数据</li><li>原始菜品图片</li><li>不包含 API Key</li></ul><button className="button-primary" onClick={() => setExportDialog({ filename: defaultBackupFilename() })}>导出 ZIP 备份</button>{exportResult && <p className="inline-notice">已导出：{exportResult.filename}<br /><small>{exportResult.displayPath}</small>{"uri" in exportResult && <><br /><button className="text-button" onClick={() => void openExportResult()}>打开导出的文件</button></>}</p>}</div></article>
        <article className="backup-card import-card"><span className="backup-icon">入</span><div><span className="eyebrow">安全恢复</span><h2>导入备份文件</h2><p>先验证并预览，再决定是否写入本机。</p><input ref={fileRef} hidden type="file" accept=".zip,application/zip" onChange={(event) => void inspectFile(event.target.files?.[0])} /><button className="button-secondary" onClick={() => fileRef.current?.click()}>选择 ZIP 文件</button></div></article>
      </div>
      <div className="data-summary panel">
        <div><span className="summary-number">{recipes.length}</span><span>本地菜谱</span></div>
        <div><span className="summary-number">{recipes.filter((item) => item.image).length}</span><span>菜品图片</span></div>
        <div><span className="summary-number">{history.length}</span><span>推荐记录</span></div>
        <button className="danger-link" onClick={() => setConfirmClear(true)}>清空业务数据</button>
      </div>
      {preview && (
        <div className="modal-backdrop">
          <section className="confirm-card import-preview" role="dialog" aria-modal="true">
            <span className="eyebrow">文件校验通过</span><h2>准备导入 {preview.recipes.length} 道菜谱</h2>
            <p>备份创建于 {new Date(preview.manifest.createdAt).toLocaleString("zh-CN")}，包含 {preview.manifest.imageFiles.length} 张图片。请选择相同 ID 的处理方式。</p>
            <label className="field"><span>冲突处理</span><select value={conflictStrategy} onChange={(event) => setConflictStrategy(event.target.value as typeof conflictStrategy)}><option value="overwrite">使用备份版本</option><option value="keep">保留本地版本</option><option value="copy">另存为副本</option></select></label>
            <div className="button-row"><button className="button-ghost" onClick={() => setPreview(undefined)}>取消</button><button className="button-primary" onClick={() => void importData()}>确认导入</button></div>
          </section>
        </div>
      )}
      {exportDialog && (
        <div className="modal-backdrop">
          <section className="confirm-card import-preview" role="dialog" aria-modal="true">
            <span className="eyebrow">选择导出位置</span><h2>保存 ZIP 备份</h2>
            <p>{isAndroidNativeBackupAvailable() ? "下一步会打开安卓系统文件选择器。你可以使用默认文件名，也可以改名，然后选择保存目录。" : "浏览器会保存到默认下载目录，你可以先修改文件名。"}</p>
            <label className="field"><span>默认文件名</span><input value={exportDialog.filename} onChange={(event) => setExportDialog({ filename: event.target.value })} /></label>
            <div className="button-row"><button className="button-ghost" disabled={exporting} onClick={() => setExportDialog(undefined)}>取消</button><button className="button-primary" disabled={exporting} onClick={() => void exportData(exportDialog.filename)}>{exporting ? "正在导出…" : isAndroidNativeBackupAvailable() ? "选择位置并导出" : "导出"}</button></div>
          </section>
        </div>
      )}
      {confirmClear && <ConfirmDialog title="清空所有本地业务数据？" body="菜谱、图片和推荐历史都会被删除。建议先导出 ZIP 备份。" confirmLabel="确认清空" onCancel={() => setConfirmClear(false)} onConfirm={async () => { await clearBusinessData(); setConfirmClear(false); onCleared(); }} />}
    </section>
  );
}

function SettingsView({
  settings,
  logs,
  onSettings,
  refreshLogs,
  onError,
}: {
  settings: AppSettings;
  logs: LogEntry[];
  onSettings: (settings: AppSettings) => Promise<void>;
  refreshLogs: () => Promise<void>;
  onError: (error: AppError) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [filter, setFilter] = useState<"all" | "warn" | "error">("all");
  const [testing, setTesting] = useState(false);
  const [testNotice, setTestNotice] = useState("");
  useEffect(() => setDraft(settings), [settings]);
  const visibleLogs = logs.filter((entry) => filter === "all" || entry.level === filter);

  function ensureAiConfig() {
    if (!draft.ai.apiKey || !draft.ai.endpoint || !draft.ai.model) {
      onError(new AppError("VALIDATION", "请先填写接口地址、模型名和 API Key"));
      return false;
    }
    return true;
  }

  async function testConnection() {
    if (!ensureAiConfig()) return;
    const aiConfig = normalizeAIConfig(draft.ai);
    const operationId = crypto.randomUUID();
    setTesting(true);
    setTestNotice("正在测试文本连接…");
    try {
      const response = await fetch(resolveAIRequestTarget(aiConfig.endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiConfig.apiKey}` },
        body: JSON.stringify({ model: aiConfig.model, max_tokens: 1, messages: [{ role: "user", content: "回复OK" }] }),
      });
      if (!response.ok) throw new AppError("NETWORK", `连接失败：${response.status}`);
      await logger.info("ai", "connection_test_success", operationId, { result: "success", message: `host=${endpointHost(draft.ai.endpoint)};model=${draft.ai.model};image=false;status=${response.status}` });
      setTestNotice("文本连接成功。图片能力请继续点击“测试图片能力”。");
    } catch (caught) {
      const error = toAppError(caught, "NETWORK"); onError(error);
      setTestNotice("文本连接失败，请检查接口地址、网络和 API Key。");
      await logger.warn("ai", "connection_test_failed", operationId, { errorCode: error.code, message: `host=${endpointHost(draft.ai.endpoint)};model=${draft.ai.model};image=false;${error.message}` });
    } finally {
      setTesting(false); await refreshLogs();
    }
  }

  async function testVision() {
    if (!ensureAiConfig()) return;
    const operationId = crypto.randomUUID();
    setTesting(true);
    setTestNotice("正在测试图片能力…");
    try {
      await testAIVisionCapability({ ...normalizeAIConfig(draft.ai), enabled: true });
      setTestNotice("图片能力测试通过。当前模型可接收图片输入。");
      await logger.info("ai", "vision_test_success", operationId, { result: "success", message: `host=${endpointHost(draft.ai.endpoint)};model=${draft.ai.model};image=true` });
    } catch (caught) {
      const error = toAppError(caught, "NETWORK"); onError(error);
      setTestNotice(caught instanceof AIRequestError ? `图片能力测试失败：${caught.suggestion}` : "图片能力测试失败，请检查模型是否支持图片输入。");
      await logger.warn("ai", "vision_test_failed", operationId, {
        result: caught instanceof AIRequestError ? caught.failure : "failed",
        errorCode: error.code,
        message: caught instanceof AIRequestError ? `host=${endpointHost(draft.ai.endpoint)};model=${draft.ai.model};image=true;status=${caught.status || "none"};failure=${caught.failure}` : error.message,
      });
    } finally {
      setTesting(false); await refreshLogs();
    }
  }

  function exportLogs() {
    const safe = logs.map((entry) => ({ ...entry, message: entry.message?.slice(0, 240) }));
    downloadBlob(new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" }), `灶房诊断日志-${new Date().toISOString().slice(0, 10)}.json`);
  }

  return (
    <section className="page-section">
      <div className="page-heading"><div><span className="eyebrow">本地设置 · 随时可清除</span><h1>设置与问题排查</h1><p>配置图片解析服务，或查看不含菜谱正文与密钥的本地诊断记录。</p></div></div>
      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="panel-heading"><div><span className="eyebrow">远程智能生成</span><h2>模型配置</h2></div><label className="switch"><input type="checkbox" checked={draft.ai.enabled} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, enabled: event.target.checked } })} /><span /></label></div>
          <div className="privacy-note"><strong>允许使用 AI 生成</strong><p>关闭时不会发起任何模型请求。开启后，也只有在菜谱编辑页上传图片或填写菜名，并点击“智能生成”才会调用模型。</p></div>
          <label className="field"><span>兼容接口地址</span><input value={draft.ai.endpoint} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, endpoint: event.target.value } })} /></label>
          <label className="field"><span>模型名</span><input value={draft.ai.model} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, model: event.target.value } })} placeholder="填写支持图片输入的模型" /></label>
          <label className="field"><span>API Key</span><input type="password" autoComplete="off" value={draft.ai.apiKey} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, apiKey: event.target.value } })} placeholder="仅保存在当前浏览器" /></label>
          {testNotice && <p className="inline-notice">{testNotice}</p>}
          <div className="button-row"><button className="button-secondary" disabled={testing} onClick={() => void testConnection()}>{testing ? "正在测试…" : "测试文本连接"}</button><button className="button-secondary" disabled={testing} onClick={() => void testVision()}>测试图片能力</button><button className="button-primary" onClick={() => void onSettings({ ...draft, ai: normalizeAIConfig(draft.ai) })}>保存设置</button></div>
        </section>
        <section className="panel settings-panel nutrition-settings-panel">
          <div className="panel-heading"><div><span className="eyebrow">本地计算 · 无需联网</span><h2>营养指标显示</h2></div><span className="local-data-count">{LOCAL_NUTRITION_DATA_INFO.count.toLocaleString("zh-CN")} 条</span></div>
          <p>勾选你关心的指标。设置会应用到菜谱卡片、详情和推荐结果；全部取消时不显示营养信息。</p>
          <div className="nutrition-selector" role="group" aria-label="选择要展示的营养指标">
            {NUTRIENT_KEYS.map((key) => {
              const checked = draft.nutrition.visibleNutrients.includes(key);
              return (
                <label className={`nutrition-option${checked ? " selected" : ""}`} key={key}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const visibleNutrients = event.target.checked
                        ? NUTRIENT_KEYS.filter((item) => item === key || draft.nutrition.visibleNutrients.includes(item))
                        : draft.nutrition.visibleNutrients.filter((item) => item !== key);
                      setDraft({ ...draft, nutrition: { ...draft.nutrition, visibleNutrients } });
                    }}
                  />
                  <span><strong>{NUTRIENT_META[key].label}</strong><small>{NUTRIENT_META[key].unit}</small></span>
                </label>
              );
            })}
          </div>
          <label className="field nutrition-people-field">
            <span>AI 食材重量估算人数</span>
            <input
              type="number"
              min={1}
              max={20}
              inputMode="numeric"
              value={draft.nutrition.estimatePeople}
              onChange={(event) => setDraft({
                ...draft,
                nutrition: { ...draft.nutrition, estimatePeople: Math.max(1, Math.min(20, Math.round(Number(event.target.value) || 2))) },
              })}
            />
            <small>默认 2 人。智能生成会据此估算每项食材克数；图片无法测出真实重量，请在保存前修正。</small>
          </label>
          <p className="settings-hint">营养值按每项食材的克数和匹配的本地标准食品计算。数据版本：{LOCAL_NUTRITION_DATA_INFO.version}。</p>
          <div className="button-row"><button className="button-primary" onClick={() => void onSettings(draft)}>保存营养显示</button></div>
        </section>
        <section className="panel settings-panel">
          <div className="panel-heading"><div><span className="eyebrow">只在本机</span><h2>调试模式</h2></div><label className="switch"><input type="checkbox" checked={draft.debugMode} onChange={(event) => { const next = { ...draft, debugMode: event.target.checked }; setDraft(next); void onSettings(next); }} /><span /></label></div>
          <p>开启后记录更详细的操作阶段和耗时。日志固定保留最近 500 条，不会自动上传。</p>
          <ul className="safe-list"><li>不会记录 API Key</li><li>不会记录图片或 ZIP 内容</li><li>不会记录完整菜谱正文</li><li>AI Token 消耗日志只记录菜名和数量</li></ul>
          <div className="button-row"><button className="button-secondary" onClick={exportLogs}>下载脱敏日志</button><button className="danger-link" onClick={async () => { await logStore.clear(); await refreshLogs(); }}>清空日志</button></div>
        </section>
      </div>
      <section className="panel log-panel">
        <div className="panel-heading"><div><span className="eyebrow">最近 {logs.length} 条</span><h2>诊断记录</h2></div><div className="segmented">{(["all", "warn", "error"] as const).map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item === "all" ? "全部" : item === "warn" ? "警告" : "错误"}</button>)}</div></div>
        <div className="log-list">
          {visibleLogs.length ? visibleLogs.slice(0, 80).map((entry) => (
            <div className={`log-row log-${entry.level}`} key={entry.id}>
              <span className="log-level">{entry.level}</span>
              <div><strong>{entry.event === "recipe_token_usage" ? "AI · 菜谱 Token 消耗" : `${entry.module} · ${entry.event}`}</strong><small>{new Date(entry.timestamp).toLocaleString("zh-CN")} · 操作 {entry.operationId.slice(0, 8)} {entry.durationMs ? `· ${entry.durationMs}ms` : ""}</small>{entry.message && <p>{entry.message}</p>}</div>
              {entry.errorCode && <code>{entry.errorCode}</code>}
            </div>
          )) : <div className="empty-log">暂无符合条件的诊断记录</div>}
        </div>
      </section>
    </section>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <div className="modal-backdrop">
      <section className="confirm-card" role="alertdialog" aria-modal="true">
        <span className="danger-symbol">!</span><h2>{title}</h2><p>{body}</p>
        <div className="button-row"><button className="button-ghost" onClick={onCancel}>取消</button><button className="button-danger" onClick={() => void onConfirm()}>{confirmLabel}</button></div>
      </section>
    </div>
  );
}
