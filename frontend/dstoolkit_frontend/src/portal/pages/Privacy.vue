<script setup lang="ts">
/**
 * Privacy.vue —— 隐私政策
 * 门户内的静态法律文档页，适配明暗主题。
 */
import { computed } from 'vue'
const updatedAt = computed(() => '2026 年 09 月 06 日')
</script>

<template>
  <div class="legal-page">
    <div class="legal-inner">
      <header class="legal-header">
        <h1 class="legal-title">隐私政策</h1>
        <p class="legal-meta">最后更新于 {{ updatedAt }}</p>
      </header>

      <div class="legal-content">
        <p class="lead">
          我们深知个人信息对您的重要性，并竭尽全力保护您的个人信息安全。本隐私政策旨在向您说明 <strong>Deepseek Toolkit</strong>（以下简称"本服务"或"我们"）如何收集、使用、存储、共享和保护您的个人信息。请您在使用本服务前，仔细阅读并充分理解本政策。
        </p>

        <h2>一、我们收集的信息</h2>
        <p>我们仅在为您提供服务所必需的范围内收集以下信息：</p>
        <ol>
          <li>
            <strong>账号信息：</strong>注册时您提供的用户名、密码（加密存储）；若您选择绑定手机号，我们会收集您的手机号码，仅用于身份验证、安全保护及云端功能解锁。
          </li>
          <li>
            <strong>对话与内容数据：</strong>您导入的对话数据、文件、续聊内容、生成的试卷等。这些数据是您的核心资产，存储于您所选择的存储位置（本地或云端）。
          </li>
          <li>
            <strong>设备与日志信息：</strong>为保障服务安全与稳定运行，我们可能收集设备型号、操作系统、浏览器类型、IP 地址、访问时间等日志信息。
          </li>
          <li>
            <strong>支付信息：</strong>若您使用付费服务，支付由第三方支付渠道处理，我们不会存储您的银行卡号、密码等敏感支付信息，仅接收交易结果。
          </li>
        </ol>

        <h2>二、我们如何使用信息</h2>
        <ol>
          <li>为您提供对话管理、检索、续聊、统计、导出等核心功能；</li>
          <li>进行身份验证、安全风控，保护您的账号与数据安全；</li>
          <li>改进和优化产品功能、性能与用户体验；</li>
          <li>在您同意的范围内，向您推送服务通知、活动信息（您可随时关闭）；</li>
          <li>遵守法律法规的要求，或响应有权机关的合法请求。</li>
        </ol>

        <h2>三、信息的存储与保护</h2>
        <ol>
          <li>
            <strong>本地存储：</strong>在离线模式下，您的对话数据仅存储于您的本地设备，我们不会上传或访问。
          </li>
          <li>
            <strong>云端存储：</strong>当您开启云端同步并绑定手机号后，相关数据将加密上传至云端服务器，以便多设备同步。我们采用行业通用的加密技术和安全措施保护您的数据。
          </li>
          <li>我们仅在实现服务目的所必需的期限内保存您的信息，超出期限后将依法删除或匿名化处理。</li>
          <li>我们建立了数据安全管理制度，采取访问控制、加密传输、日志审计等措施防止信息泄露、损毁或丢失。</li>
        </ol>

        <h2>四、信息的共享与披露</h2>
        <p>除以下情形外，我们不会向任何第三方共享您的个人信息：</p>
        <ol>
          <li>获得您的明确同意；</li>
          <li>为完成 AI 续聊、Agent 对话等功能，需将相关内容传输给第三方模型提供方进行处理（内容不包含您的账号身份信息）；</li>
          <li>根据法律法规、司法机关或行政机关的强制性要求；</li>
          <li>为维护我们及用户的合法权益，在紧急情况下采取必要措施。</li>
        </ol>
        <p>我们承诺不会将您的对话数据出售给任何第三方。</p>

        <h2>五、您的权利</h2>
        <p>您对自己的个人信息享有以下权利：</p>
        <ol>
          <li><strong>访问与更正：</strong>您可在个人中心查看、修改您的账号信息；</li>
          <li><strong>删除：</strong>您可删除自己的对话数据或注销账号，注销后我们将依法删除您的个人信息；</li>
          <li><strong>撤回同意：</strong>您可通过关闭相关功能撤回此前作出的同意；</li>
          <li><strong>投诉与举报：</strong>如您认为我们的行为侵害了您的权益，可通过本服务内的联系方式进行投诉。</li>
        </ol>

        <h2>六、Cookie 与同类技术</h2>
        <p>我们可能使用 Cookie 或同类技术以维持您的登录状态、记住您的偏好设置。您可通过浏览器设置管理或删除 Cookie，但这可能影响部分功能的正常使用。</p>

        <h2>七、未成年人保护</h2>
        <ol>
          <li>我们非常重视未成年人的个人信息保护。若您为未满 14 周岁的未成年人，请在监护人陪同下阅读本政策并使用本服务。</li>
          <li>我们不会主动收集未成年人的个人信息。如监护人发现我们在未取得有效同意的情况下收集了未成年人信息，可联系我们删除。</li>
        </ol>

        <h2>八、本政策的更新</h2>
        <p>我们可能不时修订本隐私政策。修订后的政策将在本服务内公布，重大变更我们会通过显著方式通知您。若您在政策修订后继续使用本服务，视为您同意修订后的政策。</p>

        <h2>九、联系我们</h2>
        <p>如您对本隐私政策有任何疑问、意见或建议，或需行使您的相关权利，请通过本服务内的联系方式与我们取得联系，我们将在合理期限内予以回复。</p>

        <p class="closing">
          感谢您的信任，我们将持续努力保护您的信息安全。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.legal-page {
  width: 100%;
  background: var(--el-bg-color);
  padding: 48px 24px 64px;
}
.legal-inner {
  max-width: 820px;
  margin: 0 auto;
}
.legal-header {
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.legal-title {
  margin: 0 0 8px;
  font-size: 30px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.legal-meta {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.legal-content {
  font-size: 15px;
  line-height: 1.85;
  color: var(--el-text-color-regular);
}
.legal-content h2 {
  margin: 32px 0 14px;
  font-size: 19px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.legal-content h2:first-of-type {
  margin-top: 24px;
}
.legal-content p {
  margin: 12px 0;
}
.legal-content ol {
  margin: 12px 0;
  padding-left: 22px;
}
.legal-content li {
  margin: 8px 0;
}
.lead {
  font-size: 15.5px;
  color: var(--el-text-color-regular);
}
.closing {
  margin-top: 36px;
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
}

@media (max-width: 640px) {
  .legal-page {
    padding: 28px 16px 48px;
  }
  .legal-title {
    font-size: 24px;
  }
  .legal-content {
    font-size: 14.5px;
  }
}
</style>
