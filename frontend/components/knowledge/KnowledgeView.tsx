"use client";

import React, { useState, useEffect } from "react";
import { Collection, DocumentItem, QueryMatch } from "@/app/types";
import { api } from "@/app/api";

export const KnowledgeView: React.FC = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCol, setSelectedCol] = useState<Collection | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New collection modal state
  const [newColName, setNewColName] = useState("");
  const [newColDesc, setNewColDesc] = useState("");
  const [isCreatingCol, setIsCreatingCol] = useState(false);

  // Add document state
  const [docTitle, setDocTitle] = useState("");
  const [docText, setDocText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAddingDoc, setIsAddingDoc] = useState(false);

  // Vector search sandbox
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<QueryMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listCollections();
      setCollections(res);
      if (res.length > 0 && !selectedCol) {
        setSelectedCol(res[0]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load collections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchDocuments = async (colId: string) => {
    try {
      const res = await api.listDocuments(colId);
      setDocuments(res);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (selectedCol) {
      fetchDocuments(selectedCol.id);
      setSearchResults([]);
    }
  }, [selectedCol]);

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    try {
      setLoading(true);
      const created = await api.createCollection({
        name: newColName.trim(),
        description: newColDesc.trim(),
      });
      setNewColName("");
      setNewColDesc("");
      setIsCreatingCol(false);
      await fetchCollections();
      setSelectedCol(created);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCol) return;
    try {
      setLoading(true);
      if (selectedFile) {
        await api.uploadDocumentFile(selectedCol.id, selectedFile, docTitle || selectedFile.name);
      } else if (docText.trim()) {
        await api.addDocumentText(selectedCol.id, {
          title: docTitle.trim() || "Untitled Document",
          text: docText.trim(),
        });
      }
      setDocTitle("");
      setDocText("");
      setSelectedFile(null);
      setIsAddingDoc(false);
      await fetchCollections();
      await fetchDocuments(selectedCol.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCol || !searchQuery.trim()) return;
    try {
      setIsSearching(true);
      const res = await api.queryCollection(selectedCol.id, searchQuery.trim(), 4);
      setSearchResults(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row bg-canvas text-xs font-mono">
      {/* Left Sidebar: Collections list */}
      <div className="w-full lg:w-72 bg-surface border-b lg:border-b-0 lg:border-r border-surface-border flex flex-col">
        <div className="p-3 border-b border-surface-border bg-surface-subtle flex items-center justify-between">
          <span className="font-bold uppercase tracking-wider text-[10px] text-ink-dim">
            Vector Collections
          </span>
          <button
            onClick={() => setIsCreatingCol(!isCreatingCol)}
            className="px-2 py-0.5 rounded-[2px] bg-surface border border-surface-border hover:border-ink-muted text-ink"
          >
            + New
          </button>
        </div>

        {isCreatingCol && (
          <form
            onSubmit={handleCreateCollection}
            className="p-3 border-b border-surface-border bg-surface space-y-2"
          >
            <input
              type="text"
              placeholder="Collection Name"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              className="w-full bg-canvas border border-surface-border rounded-[2px] p-1.5 text-ink"
              required
            />
            <input
              type="text"
              placeholder="Description"
              value={newColDesc}
              onChange={(e) => setNewColDesc(e.target.value)}
              className="w-full bg-canvas border border-surface-border rounded-[2px] p-1.5 text-ink"
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setIsCreatingCol(false)}
                className="px-2 py-1 text-ink-dim"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-2 py-1 bg-surface-subtle border border-surface-border text-ink rounded-[2px]"
              >
                Create
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-surface-border">
          {collections.map((col) => {
            const isSelected = selectedCol?.id === col.id;
            return (
              <div
                key={col.id}
                onClick={() => setSelectedCol(col)}
                className={`p-3 cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-surface-subtle border-l-2 border-brand-amber text-ink"
                    : "hover:bg-surface-subtle/50 text-ink-muted"
                }`}
              >
                <div className="font-semibold text-ink flex items-center justify-between">
                  <span>{col.name}</span>
                  <span className="text-[10px] text-ink-dim font-normal">
                    {col.chunk_count} chunks
                  </span>
                </div>
                {col.description && (
                  <p className="text-[11px] text-ink-dim mt-1 line-clamp-2">
                    {col.description}
                  </p>
                )}
              </div>
            );
          })}
          {collections.length === 0 && !loading && (
            <div className="p-4 text-center text-ink-dim">
              No collections found. Create one to begin.
            </div>
          )}
        </div>
      </div>

      {/* Main Area: Document list & Vector Sandbox */}
      <div className="flex-1 flex flex-col overflow-y-auto p-4 lg:p-6 space-y-6">
        {error && (
          <div className="p-2.5 border border-brand-crimson/50 bg-brand-crimson/10 text-brand-crimson rounded-[3px]">
            {error}
          </div>
        )}

        {selectedCol ? (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-border pb-4">
              <div>
                <h2 className="text-base font-bold text-ink">{selectedCol.name}</h2>
                <p className="text-ink-muted text-[11px]">{selectedCol.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAddingDoc(!isAddingDoc)}
                  className="px-3 py-1.5 rounded-[3px] bg-surface-subtle border border-surface-border hover:border-ink-muted text-ink"
                >
                  + Add Document
                </button>
              </div>
            </div>

            {/* Document Ingestion Form */}
            {isAddingDoc && (
              <form
                onSubmit={handleAddDocument}
                className="p-4 border border-surface-border rounded-[4px] bg-surface space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] text-ink uppercase tracking-wider">
                    Ingest into Vector Store
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingDoc(false)}
                    className="text-ink-dim hover:text-ink"
                  >
                    ✕
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Document Title (e.g. System Specification)"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full bg-canvas border border-surface-border rounded-[3px] p-2 text-ink"
                />

                <div className="flex items-center gap-3">
                  <label className="cursor-pointer px-3 py-1.5 rounded-[2px] bg-surface-subtle border border-surface-border text-ink hover:border-ink-muted">
                    {selectedFile ? selectedFile.name : "Choose File (PDF, MD, TXT)"}
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,.json"
                      onChange={(e) => {
                        if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                      }}
                      className="hidden"
                    />
                  </label>
                  {selectedFile && (
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="text-brand-crimson text-[10px]"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {!selectedFile && (
                  <textarea
                    rows={4}
                    placeholder="Or paste markdown/raw text directly here..."
                    value={docText}
                    onChange={(e) => setDocText(e.target.value)}
                    className="w-full bg-canvas border border-surface-border rounded-[3px] p-2 text-ink"
                  />
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-3 py-1.5 bg-brand-amber text-canvas font-bold rounded-[3px] hover:bg-brand-amber/90 transition-colors"
                  >
                    {loading ? "Embedding..." : "Ingest & Index"}
                  </button>
                </div>
              </form>
            )}

            {/* Split Grid: Ingested Documents & Vector Search Sandbox */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Documents List */}
              <div className="space-y-3">
                <span className="font-bold text-[10px] uppercase text-ink-dim tracking-wider block">
                  Indexed Documents ({documents.length})
                </span>
                <div className="border border-surface-border rounded-[4px] bg-surface divide-y divide-surface-border max-h-[360px] overflow-y-auto">
                  {documents.map((doc) => (
                    <div key={doc.id} className="p-3">
                      <div className="flex items-center justify-between text-ink font-semibold">
                        <span className="truncate">{doc.title}</span>
                        <span className="text-[10px] text-ink-dim uppercase">
                          {doc.source}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-ink-muted mt-1">
                        <span>{doc.char_count} chars</span>
                        <span>{doc.chunk_count} chunks</span>
                        <span>{doc.created_at.slice(0, 10)}</span>
                      </div>
                    </div>
                  ))}
                  {documents.length === 0 && (
                    <div className="p-6 text-center text-ink-dim">
                      No documents in this collection.
                    </div>
                  )}
                </div>
              </div>

              {/* Vector Retrieval Sandbox */}
              <div className="space-y-3">
                <span className="font-bold text-[10px] uppercase text-ink-dim tracking-wider block">
                  pgvector Similarity Sandbox
                </span>
                <div className="border border-surface-border rounded-[4px] bg-surface p-3 space-y-3">
                  <form onSubmit={handleSearch} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Test semantic query (e.g. topological sort)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 bg-canvas border border-surface-border rounded-[3px] px-2.5 py-1.5 text-ink"
                    />
                    <button
                      type="submit"
                      disabled={isSearching}
                      className="px-3 py-1.5 bg-surface-subtle border border-surface-border text-ink rounded-[3px] hover:border-ink-muted"
                    >
                      {isSearching ? "Searching..." : "Query HNSW"}
                    </button>
                  </form>

                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {searchResults.map((m) => (
                      <div
                        key={m.chunk_id}
                        className="p-2 border border-surface-border rounded-[3px] bg-canvas space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-ink truncate">
                            {m.document_title}
                          </span>
                          <span className="text-brand-amber font-mono font-bold">
                            score: {m.score.toFixed(3)}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-muted line-clamp-3 whitespace-pre-wrap">
                          {m.content}
                        </p>
                      </div>
                    ))}
                    {searchResults.length === 0 && !isSearching && (
                      <div className="py-8 text-center text-ink-dim text-[11px]">
                        Execute a test query to verify dense vector embeddings.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-ink-dim">
            Select a collection to view documents and run retrieval tests.
          </div>
        )}
      </div>
    </div>
  );
};
