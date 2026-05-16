/**
 * 占位测试:渲染 App + MemoryRouter 不抛错
 *
 * 真实业务测试后续按 view 与 store 拆分覆盖。
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.js';

describe('App 占位', () => {
  it('能渲染并不抛错', () => {
    const { container } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
  });
});
