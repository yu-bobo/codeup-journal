import { useState } from 'react'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Table,
  Tag,
  Tooltip,
  message
} from 'antd'
import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  UserOutlined
} from '@ant-design/icons'
import type { Account, AccountInput, OrgEdition } from '@shared/types'
import { getApi } from '../api'

interface Props {
  accounts: Account[]
  activeId: string | null
  onChanged: () => Promise<void>
}

interface FormValues {
  name: string
  edition: OrgEdition
  organizationId?: string
  apiBaseUrl?: string
  token?: string
  authorFilters?: string
  defaultBranch?: string
}

/**
 * 账号管理页：多账号 CRUD、测试连接
 */
export default function AccountsPage({ accounts, activeId, onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<FormValues>()
  const edition = Form.useWatch('edition', form)

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      edition: 'central',
      defaultBranch: 'master'
    })
    setOpen(true)
  }

  const openEdit = (account: Account) => {
    setEditing(account)
    form.setFieldsValue({
      name: account.name,
      edition: account.edition,
      organizationId: account.organizationId,
      apiBaseUrl: account.apiBaseUrl,
      token: '',
      authorFilters: account.authorFilters.join(', '),
      defaultBranch: account.defaultBranch
    })
    setOpen(true)
  }

  const toInput = (values: FormValues, requireToken: boolean): AccountInput => {
    const token = values.token?.trim() || ''
    if (requireToken && !token) throw new Error('请填写个人访问令牌')
    return {
      name: values.name,
      edition: values.edition,
      organizationId: values.organizationId,
      apiBaseUrl: values.apiBaseUrl,
      token,
      authorFilters: (values.authorFilters || '')
        .split(/[,，\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      defaultBranch: values.defaultBranch || 'master'
    }
  }

  const onTest = async () => {
    try {
      const values = await form.validateFields()
      const input = toInput(values, !editing)
      if (editing && !input.token) {
        setTesting(true)
        const r = await getApi().accounts.testSaved(editing.id)
        message.success(`连接成功，可见仓库约 ${r.repoCount} 个`)
        return
      }
      setTesting(true)
      const r = await getApi().accounts.test(input)
      message.success(`连接成功，可见仓库约 ${r.repoCount} 个`)
    } catch (e: any) {
      if (e?.errorFields) return
      message.error(e?.message || String(e))
    } finally {
      setTesting(false)
    }
  }

  const closeModal = () => {
    setOpen(false)
    setEditing(null)
  }

  const onSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const stillExists = editing
        ? accounts.some((a) => a.id === editing.id)
        : false
      if (editing && stillExists) {
        const token = values.token?.trim()
        await getApi().accounts.update({
          id: editing.id,
          name: values.name,
          edition: values.edition,
          organizationId: values.organizationId,
          apiBaseUrl: values.apiBaseUrl,
          token: token || undefined,
          authorFilters: (values.authorFilters || '')
            .split(/[,，\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          defaultBranch: values.defaultBranch || 'master'
        })
        message.success('账号已更新')
      } else {
        // 新建，或编辑态账号已不在本地 → 走创建
        await getApi().accounts.create(toInput(values, true))
        message.success('账号已创建')
      }
      closeModal()
      await onChanged()
    } catch (e: any) {
      if (e?.errorFields) return
      message.error(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-card">
      <div className="page-header">
        <h2 className="page-title">账号</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建账号
        </Button>
      </div>
      <p className="page-desc">每个账号对应一套云效身份；令牌加密保存在本地。</p>
      {accounts.length === 0 ? (
        <div className="empty-hint">
          <UserOutlined />
          <span>还没有账号，点击右上角新建</span>
        </div>
      ) : (
        <Table
          rowKey="id"
          dataSource={accounts}
          pagination={false}
          columns={[
            {
              title: '名称',
              dataIndex: 'name',
              render: (name: string, row) => (
                <Space>
                  {name}
                  {row.id === activeId && <Tag color="blue">当前</Tag>}
                </Space>
              )
            },
            {
              title: '版本',
              dataIndex: 'edition',
              render: (v: OrgEdition) => (v === 'central' ? '中心版' : 'Region 版')
            },
            {
              title: '组织/接入点',
              render: (_, row) =>
                row.edition === 'central' ? row.organizationId : row.apiBaseUrl
            },
            {
              title: '作者过滤',
              dataIndex: 'authorFilters',
              render: (v: string[]) => (v.length ? v.join(', ') : '不过滤（全部）')
            },
            {
              title: '操作',
              width: 128,
              render: (_, row) => (
                <Space className="icon-action-group" size={4}>
                  <Tooltip title="编辑">
                    <Button
                      size="small"
                      type="text"
                      icon={<EditOutlined />}
                      aria-label="编辑"
                      onClick={() => openEdit(row)}
                    />
                  </Tooltip>
                  <Tooltip title="测试连接">
                    <Button
                      size="small"
                      type="text"
                      icon={<ApiOutlined />}
                      aria-label="测试连接"
                      onClick={async () => {
                        try {
                          const r = await getApi().accounts.testSaved(row.id)
                          message.success(`连接成功，可见仓库约 ${r.repoCount} 个`)
                        } catch (e: any) {
                          message.error(e?.message || String(e))
                        }
                      }}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="确定删除该账号及其本地提交数据？"
                    onConfirm={async () => {
                      await getApi().accounts.delete(row.id)
                      message.success('已删除')
                      await onChanged()
                    }}
                  >
                    <Tooltip title="删除">
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label="删除"
                      />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      )}

      <Modal
        title={editing ? '编辑账号' : '新建账号'}
        open={open}
        onCancel={closeModal}
        destroyOnClose
        width={640}
        footer={
          <Space>
            <Button onClick={closeModal}>取消</Button>
            <Button loading={testing} onClick={() => void onTest()}>
              测试连接
            </Button>
            <Button type="primary" loading={saving} onClick={() => void onSave()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="显示名称" rules={[{ required: true, message: '必填' }]}>
            <Input placeholder="例如：公司主账号" />
          </Form.Item>
          <Form.Item name="edition" label="组织类型" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="central">中心版</Radio>
              <Radio value="region">Region 版</Radio>
            </Radio.Group>
          </Form.Item>
          {edition === 'central' ? (
            <Form.Item
              name="organizationId"
              label="organizationId"
              rules={[{ required: true, message: '中心版必填' }]}
            >
              <Input placeholder="组织管理后台基本信息中的组织 ID" />
            </Form.Item>
          ) : (
            <Form.Item
              name="apiBaseUrl"
              label="API Base URL"
              rules={[{ required: true, message: 'Region 版必填' }]}
            >
              <Input placeholder="实例访问域名，如 https://xxx.devops.aliyuncs.com" />
            </Form.Item>
          )}
          <Form.Item
            name="token"
            label={editing ? '个人访问令牌（留空则不修改）' : '个人访问令牌'}
            rules={editing ? [] : [{ required: true, message: '必填' }]}
          >
            <Input.Password placeholder="云效个人设置 → 个人访问令牌" />
          </Form.Item>
          <Form.Item
            name="authorFilters"
            label="作者过滤（邮箱或姓名，逗号分隔；空=不过滤）"
          >
            <Input placeholder="you@example.com, 张三" />
          </Form.Item>
          <Form.Item name="defaultBranch" label="默认同步分支">
            <Input placeholder="master / main / develop" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
