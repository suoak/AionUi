import { Button, Message, Collapse, Tag } from '@arco-design/web-react';
import React, { useState } from 'react';
import StepsWrapper from '@/renderer/components/base/StepsWrapper';
import ModalWrapper from '@/renderer/components/base/ModalWrapper';
import { Check } from '@icon-park/react';

/**
 * Development-only component style showcase (`/test/components`).
 * 3.0 V10: not routed in production builds; English only, not localized.
 */
const ComponentsShowcase: React.FC = () => {
  const [message, contextHolder] = Message.useMessage();
  const [modalVisible, setModalVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  return (
    <div className='p-8 space-y-8 max-w-6xl mx-auto'>
      {contextHolder}

      <div>
        <h1 className='text-3xl font-bold mb-2'>CSBU WorkMate component styles</h1>
        <p className='text-t-secondary'>
          Every component style customized in arco-override.css. Development builds only.
        </p>
      </div>

      {/* Message */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Message</h2>
        <div className='space-y-3'>
          <Button type='primary' status='success' onClick={() => message.success('Success message')} size='large'>
            Success Message
          </Button>
          <Button type='primary' status='warning' onClick={() => message.warning('Warning message')} size='large'>
            Warning Message
          </Button>
          <Button type='primary' onClick={() => message.info('Info message')} size='large'>
            Info Message
          </Button>
          <Button type='primary' status='danger' onClick={() => message.error('Error message')} size='large'>
            Error Message
          </Button>
          <Button
            onClick={() => {
              message.success('Success message');
              setTimeout(() => message.warning('Warning message'), 200);
              setTimeout(() => message.info('Info message'), 400);
              setTimeout(() => message.error('Error message'), 600);
            }}
            size='large'
          >
            Show all types
          </Button>
        </div>
      </section>

      {/* Button */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Button</h2>
        <div className='flex gap-3'>
          <Button type='outline'>Outline Button</Button>
          <Button type='primary'>Primary Button</Button>
          <Button>Default Button</Button>
          <Button type='primary' shape='round'>
            Round Button
          </Button>
        </div>
      </section>

      {/* Collapse */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Collapse</h2>
        <Collapse defaultActiveKey={['1']}>
          <Collapse.Item header='Panel title 1' name='1'>
            <div>Panel content goes here.</div>
          </Collapse.Item>
          <Collapse.Item header='Panel title 2' name='2'>
            <div>Custom style: no border, 8px radius.</div>
          </Collapse.Item>
        </Collapse>
      </section>

      {/* Tag */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Tag (dark-mode tuned)</h2>
        <div className='flex gap-2 flex-wrap'>
          <Tag checkable color='blue'>
            Blue Tag
          </Tag>
          <Tag checkable color='green'>
            Green Tag
          </Tag>
          <Tag checkable color='red'>
            Red Tag
          </Tag>
          <Tag checkable color='orange'>
            Orange Tag
          </Tag>
          <Tag checkable color='gray'>
            Gray Tag
          </Tag>
        </div>
        <p className='text-sm text-t-secondary'>Tip: switch to a dark theme to compare.</p>
      </section>

      {/* Steps */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Steps</h2>
        <StepsWrapper current={currentStep} size='small'>
          <StepsWrapper.Step
            title='Step one'
            icon={currentStep > 1 ? <Check theme='filled' size={16} fill='#165dff' /> : undefined}
          />
          <StepsWrapper.Step
            title='Step two'
            icon={currentStep > 2 ? <Check theme='filled' size={16} fill='#165dff' /> : undefined}
          />
          <StepsWrapper.Step title='Step three' />
        </StepsWrapper>
        <div className='flex gap-2 mt-4'>
          <Button onClick={() => setCurrentStep(Math.max(1, currentStep - 1))} disabled={currentStep === 1}>
            Previous
          </Button>
          <Button
            onClick={() => setCurrentStep(Math.min(3, currentStep + 1))}
            disabled={currentStep === 3}
            type='primary'
          >
            Next
          </Button>
        </div>
      </section>

      {/* Modal */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Modal</h2>
        <Button type='primary' onClick={() => setModalVisible(true)}>
          Open custom modal
        </Button>
        <ModalWrapper
          title='Custom modal title'
          visible={modalVisible}
          onCancel={() => setModalVisible(false)}
          footer={
            <div className='flex justify-end gap-3'>
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
              <Button type='primary' onClick={() => setModalVisible(false)}>
                OK
              </Button>
            </div>
          }
        >
          <div className='p-6'>
            <p>A custom modal built with ModalWrapper.</p>
            <p className='mt-2 text-t-secondary'>12px radius, custom close button, theme background.</p>
          </div>
        </ModalWrapper>
      </section>
    </div>
  );
};

export default ComponentsShowcase;
