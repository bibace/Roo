import { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { yaml } from '@codemirror/lang-yaml';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';

interface ConfigurationEditorProps {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}

export function ConfigurationEditor({
  value,
  readOnly,
  onChange,
}: ConfigurationEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView>(null);
  const onChangeRef = useRef(onChange);
  const editability = useRef(new Compartment());

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const editor = new EditorView({
      parent: containerRef.current,
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        highlightActiveLine(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        yaml(),
        EditorView.contentAttributes.of({ 'aria-label': 'Configuration YAML' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        editability.current.of([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
      ],
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || editor.state.doc.toString() === value) {
      return;
    }

    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    editorRef.current?.dispatch({
      effects: editability.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  return <div className="configuration-editor" ref={containerRef} />;
}
