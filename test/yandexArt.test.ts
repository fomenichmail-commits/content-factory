import { describe, it, expect, beforeEach, vi } from "vitest";

// Мокаем fetchWithProxy, чтобы не ходить в сеть
const fetchMock = vi.fn();
vi.mock("../src/utils/proxyFetch.js", () => ({
  fetchWithProxy: (...args: unknown[]) => fetchMock(...args),
  hasProxy: () => false,
  proxyUrl: () => undefined,
}));

// Импортируем после мока
const { YandexArt } = await import("../src/content/yandexArt.js");

function cfg(over = {}): any {
  return {
    yandex: { apiKey: "key", folderId: "b1g", ...over },
    llm: { provider: "none" },
  };
}

function jsonResponse(obj: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => obj,
  };
}

describe("yandexArt", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("бросает ошибку без folderId (при наличии apiKey)", async () => {
    const y = new YandexArt({ ...cfg(), yandex: { apiKey: "k" } });
    await expect(y.generate("тема")).rejects.toThrow("YANDEX_FOLDER_ID не задан");
  });

  it("бросает ошибку если create не вернул id", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "boom" } }, false, 400));
    const y = new YandexArt(cfg());
    await expect(y.generate("тема")).rejects.toThrow("YandexART create error");
  });

  it("возвращает изображение по завершении операции (done)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "op1" })) // create
      .mockResolvedValueOnce(jsonResponse({ done: true, response: { image: "BASE64DATA" } })); // poll
    const y = new YandexArt(cfg());
    const img = await y.generate("тема");
    expect(img.base64).toBe("BASE64DATA");
    expect(img.mimeType).toBe("image/jpeg");
    expect(img.ext).toBe("jpg");
  });

  it("бросает ошибку если операция завершена, но изображения нет", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "op1" }))
      .mockResolvedValueOnce(jsonResponse({ done: true, response: {} }));
    const y = new YandexArt(cfg());
    await expect(y.generate("тема")).rejects.toThrow("YandexART не вернул изображение");
  });

  it("бросает ошибку при неудачном статусе poll", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "op1" }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "e" } }, false, 500));
    const y = new YandexArt(cfg());
    await expect(y.generate("тема")).rejects.toThrow("YandexART status error");
  });

  it("формирует modelUri с folderId", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "op1" }))
      .mockResolvedValueOnce(jsonResponse({ done: true, response: { image: "X" } }));
    const y = new YandexArt(cfg());
    await y.generate("тема");
    const createCall = fetchMock.mock.calls[0];
    const body = JSON.parse(createCall[1].body);
    expect(body.modelUri).toBe("art://b1g/yandex-art/latest");
  });

  it("добавляет image при referenceImage (edit-режим)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "op1" }))
      .mockResolvedValueOnce(jsonResponse({ done: true, response: { image: "X" } }));
    const y = new YandexArt(cfg());
    await y.generate("тема", { referenceImage: { base64: "abc", mimeType: "image/png" } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].image).toBe("data:image/png;base64,abc");
  });
});